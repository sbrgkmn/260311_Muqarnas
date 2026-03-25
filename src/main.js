import { generateMuqarnas } from "./engine.js?v=20260325e";
import { clonePreset, silverRatioUnits } from "./presets.js?v=20260325e";
import { renderPlan } from "./renderPlan.js?v=20260325e";
import { Muqarnas3DView } from "./render3d.js?v=20260325e";

const dom = {
  scope: document.getElementById("scope"),
  layers: document.getElementById("layers"),
  layerHeight: document.getElementById("layerHeight"),
  heightPattern: document.getElementById("heightPattern"),
  ratioScale: document.getElementById("ratioScale"),
  collisionEpsilon: document.getElementById("collisionEpsilon"),
  ruleOrthogonal: document.getElementById("ruleOrthogonal"),
  ruleDiagonal: document.getElementById("ruleDiagonal"),
  ruleSecondary: document.getElementById("ruleSecondary"),
  profileWidth: document.getElementById("profileWidth"),
  axisWidth: document.getElementById("axisWidth"),
  profileWidthValue: document.getElementById("profileWidthValue"),
  axisWidthValue: document.getElementById("axisWidthValue"),
  pointSize: document.getElementById("pointSize"),
  annotationSize: document.getElementById("annotationSize"),
  showProfiles: document.getElementById("showProfiles"),
  showPointMarkers: document.getElementById("showPointMarkers"),
  showAnnotations: document.getElementById("showAnnotations"),
  showGrowthArrows: document.getElementById("showGrowthArrows"),
  showGrowthValues: document.getElementById("showGrowthValues"),
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

let state = null;
let currentModel = null;

const DEFAULT_VISUAL = {
  profileWidth: 2.2,
  axisWidth: 1,
  pointSize: 2.4,
  annotationSize: 10,
  showProfiles: true,
  showPointMarkers: true,
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

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePreset(rawState) {
  const source = rawState ?? {};
  const rules = source.rules ?? {};
  return {
    scope: "full",
    layers: readNumber(source.layers, 3),
    layerHeight: readNumber(source.layerHeight, 1),
    heightPattern: typeof source.heightPattern === "string" ? source.heightPattern : "1,1,1",
    ratioScale: readNumber(source.ratioScale, 1),
    collisionEpsilon: readNumber(source.collisionEpsilon, 0.05),
    ratios: silverRatioUnits(1),
    rules: {
      orthogonal: rules.orthogonal ?? rules.orth1 ?? "b,c,b,0",
      diagonal: rules.diagonal ?? rules.diag1 ?? "b,c",
      secondary: rules.secondary ?? rules.secondary1 ?? "a,a,d",
    },
  };
}

function applyStateToControls(nextState) {
  const safe = normalizePreset(nextState);

  dom.scope.value = "full";
  dom.layers.value = String(safe.layers);
  dom.layerHeight.value = String(safe.layerHeight);
  dom.heightPattern.value = safe.heightPattern;
  dom.ratioScale.value = String(safe.ratioScale);
  dom.collisionEpsilon.value = String(safe.collisionEpsilon);
  dom.ruleOrthogonal.value = safe.rules.orthogonal;
  dom.ruleDiagonal.value = safe.rules.diagonal;
  dom.ruleSecondary.value = safe.rules.secondary;
}

function collectStateFromControls() {
  return {
    scope: "full",
    layers: readNumber(dom.layers.value, 3),
    layerHeight: readNumber(dom.layerHeight.value, 1),
    heightPattern: dom.heightPattern.value,
    ratioScale: readNumber(dom.ratioScale.value, 1),
    collisionEpsilon: readNumber(dom.collisionEpsilon.value, 0.05),
    ratios: silverRatioUnits(1),
    rules: {
      orthogonal: dom.ruleOrthogonal.value,
      diagonal: dom.ruleDiagonal.value,
      secondary: dom.ruleSecondary.value,
    },
  };
}

function normalizeVisual(rawVisual) {
  const source = rawVisual ?? {};
  return {
    profileWidth: clamp(readNumber(source.profileWidth, DEFAULT_VISUAL.profileWidth), 0.2, 8),
    axisWidth: clamp(readNumber(source.axisWidth, DEFAULT_VISUAL.axisWidth), 0.2, 6),
    pointSize: clamp(readNumber(source.pointSize, DEFAULT_VISUAL.pointSize), 0.4, 10),
    annotationSize: clamp(readNumber(source.annotationSize, DEFAULT_VISUAL.annotationSize), 7, 24),
    showProfiles: source.showProfiles !== false,
    showPointMarkers: source.showPointMarkers !== false,
    showAnnotations: source.showAnnotations !== false,
    showGrowthArrows: source.showGrowthArrows !== false,
    showGrowthValues: source.showGrowthValues !== false,
  };
}

function formatSliderValue(value) {
  return Number(value).toFixed(1);
}

function syncLineweightOutputs(rawVisual) {
  const visual = normalizeVisual(rawVisual);
  dom.profileWidthValue.value = formatSliderValue(visual.profileWidth);
  dom.axisWidthValue.value = formatSliderValue(visual.axisWidth);
}

function applyVisualToControls(rawVisual) {
  const visual = normalizeVisual(rawVisual);
  dom.profileWidth.value = String(visual.profileWidth);
  dom.axisWidth.value = String(visual.axisWidth);
  dom.pointSize.value = String(visual.pointSize);
  dom.annotationSize.value = String(visual.annotationSize);
  dom.showProfiles.checked = visual.showProfiles;
  dom.showPointMarkers.checked = visual.showPointMarkers;
  dom.showAnnotations.checked = visual.showAnnotations;
  dom.showGrowthArrows.checked = visual.showGrowthArrows;
  dom.showGrowthValues.checked = visual.showGrowthValues;
  syncLineweightOutputs(visual);
}

function collectVisualFromControls() {
  const visual = normalizeVisual({
    profileWidth: dom.profileWidth.value,
    axisWidth: dom.axisWidth.value,
    pointSize: dom.pointSize.value,
    annotationSize: dom.annotationSize.value,
    showProfiles: dom.showProfiles.checked,
    showPointMarkers: dom.showPointMarkers.checked,
    showAnnotations: dom.showAnnotations.checked,
    showGrowthArrows: dom.showGrowthArrows.checked,
    showGrowthValues: dom.showGrowthValues.checked,
  });
  syncLineweightOutputs(visual);
  return visual;
}

function refresh(autoFrame = false) {
  state = normalizePreset(collectStateFromControls());
  const visual = collectVisualFromControls();
  currentModel = generateMuqarnas(state);
  renderPlan(dom.planCanvas, currentModel, state.scope, visual, planView);
  threeView.setModel(currentModel, state.scope, autoFrame, visual);
}
state = normalizePreset(clonePreset("Haci Kilic"));
applyStateToControls(state);
applyVisualToControls(DEFAULT_VISUAL);
refresh(true);

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

bindPlanInteractions();

const controls = document.querySelectorAll("input, select");
for (const control of controls) {
  control.addEventListener("input", () => {
    refresh(false);
  });
  control.addEventListener("change", () => {
    refresh(false);
  });
}

dom.resetView.addEventListener("click", () => {
  if (!currentModel) {
    return;
  }
  threeView.resetView();
});

window.addEventListener("resize", () => {
  if (!currentModel) {
    return;
  }
  renderPlan(dom.planCanvas, currentModel, state.scope, collectVisualFromControls(), planView);
});
