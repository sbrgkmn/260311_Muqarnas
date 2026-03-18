import { generateMuqarnas } from "./engine.js";
import { PRESETS, clonePreset, silverDelta, silverRatioUnits } from "./presets.js";
import { renderPlan } from "./renderPlan.js";
import { Muqarnas3DView } from "./render3d.js";

const dom = {
  preset: document.getElementById("preset"),
  scope: document.getElementById("scope"),
  layers: document.getElementById("layers"),
  freezeRecursion: document.getElementById("freezeRecursion"),
  previewLayer: document.getElementById("previewLayer"),
  previewLayerValue: document.getElementById("previewLayerValue"),
  stepRecursion: document.getElementById("stepRecursion"),
  layerHeight: document.getElementById("layerHeight"),
  initialRadius: document.getElementById("initialRadius"),
  ratioScale: document.getElementById("ratioScale"),
  ruleOrth1: document.getElementById("ruleOrth1"),
  ruleOrth2: document.getElementById("ruleOrth2"),
  ruleDiag1: document.getElementById("ruleDiag1"),
  ruleDiag2: document.getElementById("ruleDiag2"),
  ruleSecondary1: document.getElementById("ruleSecondary1"),
  ruleSecondary2: document.getElementById("ruleSecondary2"),
  phaseSwitchLayer: document.getElementById("phaseSwitchLayer"),
  convergenceEvery: document.getElementById("convergenceEvery"),
  convergenceStrength: document.getElementById("convergenceStrength"),
  branchClockOffset: document.getElementById("branchClockOffset"),
  branchingType: document.getElementById("branchingType"),
  starAmplitude: document.getElementById("starAmplitude"),
  polygonSmoothing: document.getElementById("polygonSmoothing"),
  branchBoost: document.getElementById("branchBoost"),
  connectionType: document.getElementById("connectionType"),
  resetView: document.getElementById("resetView"),
  planCanvas: document.getElementById("planCanvas"),
  threeRoot: document.getElementById("threeRoot"),
};

let activePresetName = "Haci Kilic (Kayseri)";
let state = clonePreset(activePresetName);
let currentModel = null;
let currentVisibleModel = null;
let suppressCustomFlag = false;

const threeView = new Muqarnas3DView(dom.threeRoot);

function fillPresetOptions() {
  const names = Object.keys(PRESETS);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    dom.preset.appendChild(option);
  }
  dom.preset.value = activePresetName;
}

function toFixedNum(value) {
  return Number(value).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncPreviewControls(totalLayers, previewLayer, freezeRecursion) {
  const clamped = clamp(Math.round(previewLayer), 0, totalLayers);
  dom.previewLayer.max = String(totalLayers);
  dom.previewLayer.value = String(clamped);
  dom.previewLayerValue.textContent = `${clamped}/${totalLayers}`;
  dom.previewLayer.disabled = !freezeRecursion;
  dom.stepRecursion.disabled = !freezeRecursion;
}

function applyStateToControls(nextState) {
  suppressCustomFlag = true;

  dom.scope.value = nextState.scope;
  dom.layers.value = nextState.layers;
  dom.freezeRecursion.checked = nextState.freezeRecursion ?? true;
  dom.layerHeight.value = nextState.layerHeight;
  dom.initialRadius.value = nextState.initialRadius;
  dom.ratioScale.value = nextState.ratioScale;

  dom.ruleOrth1.value = nextState.rules.orth1;
  dom.ruleOrth2.value = nextState.rules.orth2;
  dom.ruleDiag1.value = nextState.rules.diag1;
  dom.ruleDiag2.value = nextState.rules.diag2;
  dom.ruleSecondary1.value = nextState.rules.secondary1;
  dom.ruleSecondary2.value = nextState.rules.secondary2;

  dom.phaseSwitchLayer.value = nextState.phaseSwitchLayer;
  dom.convergenceEvery.value = nextState.convergenceEvery;
  dom.convergenceStrength.value = nextState.convergenceStrength;
  dom.branchClockOffset.value = nextState.branchClockOffset;
  dom.branchingType.value = nextState.branchingType;
  dom.starAmplitude.value = nextState.starAmplitude;
  dom.polygonSmoothing.value = nextState.polygonSmoothing;
  dom.branchBoost.value = nextState.branchBoost;
  dom.connectionType.value = nextState.connectionType;
  syncPreviewControls(nextState.layers, nextState.previewLayer ?? nextState.layers, dom.freezeRecursion.checked);

  const delta = silverDelta();
  dom.resetView.textContent = `Reset 3D Camera (dS=${toFixedNum(delta)})`;

  suppressCustomFlag = false;
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectStateFromControls() {
  const layers = readNumber(dom.layers.value, 12);
  const freezeRecursion = dom.freezeRecursion.checked;
  const previewLayer = clamp(readNumber(dom.previewLayer.value, layers), 0, layers);
  syncPreviewControls(layers, previewLayer, freezeRecursion);

  const ratios = silverRatioUnits(1);

  return {
    scope: dom.scope.value,
    layers,
    freezeRecursion,
    previewLayer,
    layerHeight: readNumber(dom.layerHeight.value, 0.6),
    initialRadius: readNumber(dom.initialRadius.value, 0.18),
    ratioScale: readNumber(dom.ratioScale.value, 1),
    lockSilverRatios: true,
    ratios,
    rules: {
      orth1: dom.ruleOrth1.value,
      orth2: dom.ruleOrth2.value,
      diag1: dom.ruleDiag1.value,
      diag2: dom.ruleDiag2.value,
      secondary1: dom.ruleSecondary1.value,
      secondary2: dom.ruleSecondary2.value,
    },
    phaseSwitchLayer: readNumber(dom.phaseSwitchLayer.value, 0),
    convergenceEvery: readNumber(dom.convergenceEvery.value, 3),
    convergenceStrength: readNumber(dom.convergenceStrength.value, 0.7),
    branchClockOffset: readNumber(dom.branchClockOffset.value, 0),
    branchingType: dom.branchingType.value,
    starAmplitude: readNumber(dom.starAmplitude.value, 0.1),
    polygonSmoothing: readNumber(dom.polygonSmoothing.value, 0.35),
    branchBoost: readNumber(dom.branchBoost.value, 0.1),
    connectionType: dom.connectionType.value,
  };
}

function buildVisibleModel(model, nextState) {
  if (!model || !model.layers?.length) {
    return model;
  }

  const visibleLayerCount = nextState.freezeRecursion ? clamp(nextState.previewLayer, 0, nextState.layers) : nextState.layers;
  const visibleTileLayers = Array.isArray(model.tileLayers) ? model.tileLayers.slice(0, visibleLayerCount + 1) : undefined;

  return {
    ...model,
    layers: model.layers.slice(0, visibleLayerCount + 1),
    tileLayers: visibleTileLayers,
    visibleLayerCount,
  };
}

function refresh(autoFrame = false) {
  state = collectStateFromControls();

  currentModel = generateMuqarnas(state);
  currentVisibleModel = buildVisibleModel(currentModel, state);
  renderPlan(dom.planCanvas, currentVisibleModel, state.scope);
  threeView.setModel(currentVisibleModel, state.scope, state.connectionType, autoFrame);
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
applyStateToControls(state);
refresh(true);

const allInputs = document.querySelectorAll("input, select");
const debugOnlyControls = new Set(["freezeRecursion", "previewLayer"]);
for (const input of allInputs) {
  if (input.id === "preset") {
    continue;
  }

  input.addEventListener("input", () => {
    if (!debugOnlyControls.has(input.id)) {
      markCustom();
    }
    refresh(false);
  });

  input.addEventListener("change", () => {
    if (!debugOnlyControls.has(input.id)) {
      markCustom();
    }
    refresh(false);
  });
}

dom.stepRecursion.addEventListener("click", () => {
  const maxLayer = readNumber(dom.previewLayer.max, readNumber(dom.layers.value, 12));
  const current = readNumber(dom.previewLayer.value, 0);
  dom.freezeRecursion.checked = true;
  dom.previewLayer.value = String((current + 1) % (maxLayer + 1));
  refresh(false);
});

dom.preset.addEventListener("change", (event) => {
  const name = event.target.value;
  activePresetName = name;
  const preset = clonePreset(name);
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
  if (!currentVisibleModel) {
    return;
  }
  renderPlan(dom.planCanvas, currentVisibleModel, state.scope);
});
