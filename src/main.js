import { generateMuqarnas } from "./engine.js?v=20260321q";
import { PRESETS, clonePreset, silverRatioUnits } from "./presets.js?v=20260321q";
import { renderPlan } from "./renderPlan.js?v=20260321q";
import { Muqarnas3DView } from "./render3d.js?v=20260321q";

const dom = {
  preset: document.getElementById("preset"),
  scope: document.getElementById("scope"),
  layers: document.getElementById("layers"),
  layerHeight: document.getElementById("layerHeight"),
  heightPattern: document.getElementById("heightPattern"),
  ratioScale: document.getElementById("ratioScale"),
  collisionEpsilon: document.getElementById("collisionEpsilon"),
  ruleOrthogonal: document.getElementById("ruleOrthogonal"),
  ruleDiagonal: document.getElementById("ruleDiagonal"),
  ruleSecondary: document.getElementById("ruleSecondary"),
  connectionType: document.getElementById("connectionType"),
  tileOpacity: document.getElementById("tileOpacity"),
  tileEdgeWidth: document.getElementById("tileEdgeWidth"),
  profileWidth: document.getElementById("profileWidth"),
  axisWidth: document.getElementById("axisWidth"),
  pointSize: document.getElementById("pointSize"),
  annotationSize: document.getElementById("annotationSize"),
  showProfiles: document.getElementById("showProfiles"),
  showPointMarkers: document.getElementById("showPointMarkers"),
  showAnnotations: document.getElementById("showAnnotations"),
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

let activePresetName = "Haci Kilic";
let state = null;
let currentModel = null;
let suppressCustomFlag = false;
const VISUAL_CONTROL_IDS = new Set([
  "tileOpacity",
  "tileEdgeWidth",
  "profileWidth",
  "axisWidth",
  "pointSize",
  "annotationSize",
  "showProfiles",
  "showPointMarkers",
  "showAnnotations",
]);

const DEFAULT_VISUAL = {
  tileOpacity: 0.66,
  tileEdgeWidth: 1.1,
  profileWidth: 2.2,
  axisWidth: 1,
  pointSize: 2.4,
  annotationSize: 10,
  showProfiles: true,
  showPointMarkers: true,
  showAnnotations: true,
};

const threeView = new Muqarnas3DView(dom.threeRoot);

function fillPresetOptions() {
  for (const name of Object.keys(PRESETS)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    dom.preset.appendChild(option);
  }
  dom.preset.value = activePresetName;
}

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
    scope: source.scope ?? "full",
    layers: readNumber(source.layers, 12),
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
    connectionType: source.connectionType === "divergent" ? "divergent" : "convergent",
  };
}

function applyStateToControls(nextState) {
  const safe = normalizePreset(nextState);
  suppressCustomFlag = true;

  dom.scope.value = safe.scope;
  dom.layers.value = String(safe.layers);
  dom.layerHeight.value = String(safe.layerHeight);
  dom.heightPattern.value = safe.heightPattern;
  dom.ratioScale.value = String(safe.ratioScale);
  dom.collisionEpsilon.value = String(safe.collisionEpsilon);
  dom.ruleOrthogonal.value = safe.rules.orthogonal;
  dom.ruleDiagonal.value = safe.rules.diagonal;
  dom.ruleSecondary.value = safe.rules.secondary;
  dom.connectionType.value = safe.connectionType;

  suppressCustomFlag = false;
}

function collectStateFromControls() {
  return {
    scope: dom.scope.value,
    layers: readNumber(dom.layers.value, 12),
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
    connectionType: dom.connectionType.value,
  };
}

function normalizeVisual(rawVisual) {
  const source = rawVisual ?? {};
  return {
    tileOpacity: clamp(readNumber(source.tileOpacity, DEFAULT_VISUAL.tileOpacity), 0.05, 1),
    tileEdgeWidth: clamp(readNumber(source.tileEdgeWidth, DEFAULT_VISUAL.tileEdgeWidth), 0.2, 6),
    profileWidth: clamp(readNumber(source.profileWidth, DEFAULT_VISUAL.profileWidth), 0.2, 8),
    axisWidth: clamp(readNumber(source.axisWidth, DEFAULT_VISUAL.axisWidth), 0.2, 6),
    pointSize: clamp(readNumber(source.pointSize, DEFAULT_VISUAL.pointSize), 0.4, 10),
    annotationSize: clamp(readNumber(source.annotationSize, DEFAULT_VISUAL.annotationSize), 7, 24),
    showProfiles: source.showProfiles !== false,
    showPointMarkers: source.showPointMarkers !== false,
    showAnnotations: source.showAnnotations !== false,
  };
}

function applyVisualToControls(rawVisual) {
  const visual = normalizeVisual(rawVisual);
  dom.tileOpacity.value = String(visual.tileOpacity);
  dom.tileEdgeWidth.value = String(visual.tileEdgeWidth);
  dom.profileWidth.value = String(visual.profileWidth);
  dom.axisWidth.value = String(visual.axisWidth);
  dom.pointSize.value = String(visual.pointSize);
  dom.annotationSize.value = String(visual.annotationSize);
  dom.showProfiles.checked = visual.showProfiles;
  dom.showPointMarkers.checked = visual.showPointMarkers;
  dom.showAnnotations.checked = visual.showAnnotations;
}

function collectVisualFromControls() {
  return normalizeVisual({
    tileOpacity: dom.tileOpacity.value,
    tileEdgeWidth: dom.tileEdgeWidth.value,
    profileWidth: dom.profileWidth.value,
    axisWidth: dom.axisWidth.value,
    pointSize: dom.pointSize.value,
    annotationSize: dom.annotationSize.value,
    showProfiles: dom.showProfiles.checked,
    showPointMarkers: dom.showPointMarkers.checked,
    showAnnotations: dom.showAnnotations.checked,
  });
}

function refresh(autoFrame = false) {
  state = normalizePreset(collectStateFromControls());
  const visual = collectVisualFromControls();
  currentModel = generateMuqarnas(state);
  renderPlan(dom.planCanvas, currentModel, state.scope, visual);
  threeView.setModel(currentModel, state.scope, state.connectionType, autoFrame, visual);
}

function markCustom() {
  if (suppressCustomFlag) {
    return;
  }
  if (dom.preset.value !== "Custom") {
    dom.preset.value = "Custom";
    activePresetName = "Custom";
  }
}

fillPresetOptions();
state = normalizePreset(clonePreset(activePresetName));
applyStateToControls(state);
applyVisualToControls(DEFAULT_VISUAL);
refresh(true);

const controls = document.querySelectorAll("input, select");
for (const control of controls) {
  if (control.id === "preset") {
    continue;
  }
  control.addEventListener("input", () => {
    if (!VISUAL_CONTROL_IDS.has(control.id)) {
      markCustom();
    }
    refresh(false);
  });
  control.addEventListener("change", () => {
    if (!VISUAL_CONTROL_IDS.has(control.id)) {
      markCustom();
    }
    refresh(false);
  });
}

dom.preset.addEventListener("change", (event) => {
  const name = event.target.value;
  activePresetName = name;
  const preset = normalizePreset(clonePreset(name));
  applyStateToControls(preset);
  refresh(true);
});

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
  renderPlan(dom.planCanvas, currentModel, state.scope, collectVisualFromControls());
});
