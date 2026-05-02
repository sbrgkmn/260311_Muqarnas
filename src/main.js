import { generateMuqarnas } from "./engine.js?v=20260501b";
import { clonePreset, PRESET_ORDER, PRESETS, silverRatioUnits } from "./presets.js?v=20260501b";
import { renderPlan } from "./renderPlan.js?v=20260501b";
import { Muqarnas3DView } from "./render3d.js?v=20260501b";

const dom = {
  presetSelect: document.getElementById("presetSelect"),
  presetName: document.getElementById("presetName"),
  presetLocation: document.getElementById("presetLocation"),
  presetCadence: document.getElementById("presetCadence"),
  presetFigure: document.getElementById("presetFigure"),
  presetDescription: document.getElementById("presetDescription"),
  layers: document.getElementById("layers"),
  layersValue: document.getElementById("layersValue"),
  layerHeight: document.getElementById("layerHeight"),
  layerHeightValue: document.getElementById("layerHeightValue"),
  ratioScale: document.getElementById("ratioScale"),
  ratioScaleValue: document.getElementById("ratioScaleValue"),
  connectionType: document.getElementById("connectionType"),
  showTiles: document.getElementById("showTiles"),
  showProfiles: document.getElementById("showProfiles"),
  showPointMarkers: document.getElementById("showPointMarkers"),
  showAnnotations: document.getElementById("showAnnotations"),
  showGrowthArrows: document.getElementById("showGrowthArrows"),
  ruleSummary: document.getElementById("ruleSummary"),
  resetView: document.getElementById("resetView"),
  planCanvas: document.getElementById("planCanvas"),
  threeRoot: document.getElementById("threeRoot"),
};

function assertDomBindings(bindings) {
  const missing = Object.entries(bindings)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`DOM binding error: missing element(s): ${missing.join(", ")}`);
  }
}

assertDomBindings(dom);

const DEFAULT_VISUAL = {
  profileWidth: 1.8,
  axisWidth: 0.9,
  pointSize: 2.2,
  annotationSize: 10,
  showTiles: true,
  showProfiles: true,
  showPointMarkers: false,
  showAnnotations: false,
  showGrowthArrows: true,
  showGrowthValues: false,
};

const threeView = new Muqarnas3DView(dom.threeRoot);
const planView = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

let selectedPreset = PRESET_ORDER[0];
let state = null;
let currentModel = null;

function presetFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("preset");
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return PRESET_ORDER.find((key) => {
    const preset = PRESETS[key];
    return (
      key.toLowerCase() === normalized ||
      preset?.id?.toLowerCase() === normalized ||
      preset?.name?.toLowerCase() === normalized
    );
  }) ?? null;
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRules(source = {}) {
  return {
    orthogonal: source.orthogonal ?? source.orth1 ?? "b,c,b,v",
    diagonal: source.diagonal ?? source.diag1 ?? "b,c",
    secondary: source.secondary ?? source.secondary1 ?? "a,a,d",
  };
}

function normalizePreset(rawState) {
  const source = rawState ?? {};
  return {
    id: source.id ?? "haci-kilic",
    name: source.name ?? "Haci Kilic Mosque",
    location: source.location ?? "Kayseri",
    cadence: source.cadence ?? "Recursive octagonal growth",
    sourceFigure: source.sourceFigure ?? "",
    description: source.description ?? "",
    scope: "full",
    layers: clamp(Math.round(readNumber(source.layers, 8)), 1, 24),
    layerHeight: clamp(readNumber(source.layerHeight, 1), 0.1, 3),
    heightPattern: typeof source.heightPattern === "string" ? source.heightPattern : "1,1,1",
    ratioScale: clamp(readNumber(source.ratioScale, 1), 0.25, 2.5),
    collisionEpsilon: clamp(readNumber(source.collisionEpsilon, 0.05), 0.005, 1),
    convergenceEpsilon: clamp(readNumber(source.convergenceEpsilon, 0), 0, 1),
    branchAngles: source.branchAngles ?? null,
    stopSecondaryOnVertical: source.stopSecondaryOnVertical === true,
    stopSecondaryBranches: source.stopSecondaryBranches === true,
    continueCenterBranchesOnly: source.continueCenterBranchesOnly === true,
    connectionType: source.connectionType === "divergent" ? "divergent" : "convergent",
    ratios: silverRatioUnits(1),
    rules: normalizeRules(source.rules),
    rulePhases: Array.isArray(source.rulePhases) ? source.rulePhases : null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLayerRange(phase) {
  const from = Math.max(1, Math.round(Number(phase.fromLayer) || 1));
  const rawTo = Number(phase.toLayer);
  if (!Number.isFinite(rawTo)) {
    return `L${from}+`;
  }
  return from === rawTo ? `L${from}` : `L${from}-L${Math.round(rawTo)}`;
}

function ruleLine(label, value) {
  return `<span>${label}</span><code>${escapeHtml(value)}</code>`;
}

function renderRuleSummary(nextState) {
  const phases = Array.isArray(nextState.rulePhases) && nextState.rulePhases.length
    ? nextState.rulePhases
    : [{
      name: "All layers",
      fromLayer: 1,
      rules: nextState.rules,
    }];

  dom.ruleSummary.innerHTML = phases.map((phase) => {
    const rules = normalizeRules(phase.rules);
    return `
      <div class="rule-card">
        <div class="rule-card-title">
          <strong>${escapeHtml(phase.name ?? "Rule")}</strong>
          <span>${escapeHtml(formatLayerRange(phase))}</span>
        </div>
        <div class="rule-grid">
          ${ruleLine("Orthogonal", rules.orthogonal)}
          ${ruleLine("Diagonal", rules.diagonal)}
          ${ruleLine("Secondary", rules.secondary)}
        </div>
      </div>
    `;
  }).join("");
}

function populatePresets() {
  dom.presetSelect.innerHTML = "";
  for (const key of PRESET_ORDER) {
    const preset = PRESETS[key];
    const option = document.createElement("option");
    option.value = key;
    option.textContent = preset?.name ?? key;
    dom.presetSelect.appendChild(option);
  }
}

function syncOutputs() {
  dom.layersValue.value = `${dom.layers.value} layers`;
  dom.layerHeightValue.value = Number(dom.layerHeight.value).toFixed(2);
  dom.ratioScaleValue.value = `${Number(dom.ratioScale.value).toFixed(2)}x`;
}

function applyStateToControls(nextState) {
  dom.presetSelect.value = selectedPreset;
  dom.presetName.textContent = nextState.name;
  dom.presetLocation.textContent = nextState.location;
  dom.presetCadence.textContent = nextState.cadence;
  dom.presetFigure.textContent = nextState.sourceFigure;
  dom.presetDescription.textContent = nextState.description;
  dom.layers.value = String(nextState.layers);
  dom.layerHeight.value = String(nextState.layerHeight);
  dom.ratioScale.value = String(nextState.ratioScale);
  dom.connectionType.value = nextState.connectionType;
  dom.showTiles.checked = DEFAULT_VISUAL.showTiles;
  dom.showProfiles.checked = DEFAULT_VISUAL.showProfiles;
  dom.showPointMarkers.checked = DEFAULT_VISUAL.showPointMarkers;
  dom.showAnnotations.checked = DEFAULT_VISUAL.showAnnotations;
  dom.showGrowthArrows.checked = DEFAULT_VISUAL.showGrowthArrows;
  syncOutputs();
  renderRuleSummary(nextState);
}

function collectStateFromControls() {
  return normalizePreset({
    ...state,
    layers: readNumber(dom.layers.value, state.layers),
    layerHeight: readNumber(dom.layerHeight.value, state.layerHeight),
    ratioScale: readNumber(dom.ratioScale.value, state.ratioScale),
    connectionType: dom.connectionType.value,
  });
}

function collectVisualFromControls() {
  return {
    ...DEFAULT_VISUAL,
    showTiles: dom.showTiles.checked,
    showProfiles: dom.showProfiles.checked,
    showPointMarkers: dom.showPointMarkers.checked,
    showAnnotations: dom.showAnnotations.checked,
    showGrowthArrows: dom.showGrowthArrows.checked,
  };
}

function refresh(autoFrame = false) {
  state = collectStateFromControls();
  syncOutputs();
  currentModel = generateMuqarnas(state);
  const visual = collectVisualFromControls();
  renderPlan(dom.planCanvas, currentModel, state.scope, visual, planView);
  threeView.setModel(currentModel, state.scope, autoFrame, visual);
}

function loadPreset(key) {
  selectedPreset = key;
  state = normalizePreset(clonePreset(key));
  planView.zoom = 1;
  planView.panX = 0;
  planView.panY = 0;
  applyStateToControls(state);
  refresh(true);
}

function bindPlanInteractions() {
  const canvas = dom.planCanvas;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";

  let drag = null;

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const sx = mx - cx;
    const sy = my - cy;

    const oldZoom = clamp(Number(planView.zoom) || 1, 0.35, 8);
    const zoomFactor = event.deltaY < 0 ? 1.12 : (1 / 1.12);
    const newZoom = clamp(oldZoom * zoomFactor, 0.35, 8);
    if (Math.abs(newZoom - oldZoom) < 1e-6) {
      return;
    }

    planView.panX = sx - ((sx - planView.panX) / oldZoom) * newZoom;
    planView.panY = sy - ((sy - planView.panY) / oldZoom) * newZoom;
    planView.zoom = newZoom;
    refresh(false);
  }, { passive: false });

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    drag = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (event) => {
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY };
    planView.panX += dx;
    planView.panY += dy;
    refresh(false);
  });

  window.addEventListener("mouseup", () => {
    if (!drag) {
      return;
    }
    drag = null;
    canvas.style.cursor = "grab";
  });

  canvas.addEventListener("dblclick", () => {
    planView.zoom = 1;
    planView.panX = 0;
    planView.panY = 0;
    refresh(false);
  });
}

populatePresets();
bindPlanInteractions();
selectedPreset = presetFromUrl() ?? selectedPreset;
loadPreset(selectedPreset);

dom.presetSelect.addEventListener("change", () => {
  loadPreset(dom.presetSelect.value);
});

for (const control of [
  dom.layers,
  dom.layerHeight,
  dom.ratioScale,
  dom.connectionType,
  dom.showTiles,
  dom.showProfiles,
  dom.showPointMarkers,
  dom.showAnnotations,
  dom.showGrowthArrows,
]) {
  control.addEventListener("input", () => refresh(false));
  control.addEventListener("change", () => refresh(false));
}

dom.resetView.addEventListener("click", () => {
  if (currentModel) {
    threeView.resetView();
  }
});

window.addEventListener("resize", () => {
  if (!currentModel) {
    return;
  }
  renderPlan(dom.planCanvas, currentModel, state.scope, collectVisualFromControls(), planView);
});
