export const BASE_ANGLE_DEG = 22.5;
export const BRANCH_COUNT = 16;

export function silverRatioUnits(a = 1) {
  const sqrt2 = Math.SQRT2;
  return {
    a,
    b: Math.sqrt(2 - sqrt2) * a,
    c: Math.sqrt(4 - 2 * sqrt2) * a,
    d: (sqrt2 - 1) * a,
    e: sqrt2 * a,
    f: (1 - sqrt2 / 2) * a,
    g: (sqrt2 / 2) * a,
  };
}

export function silverDelta() {
  return 1 + Math.SQRT2;
}

function basePreset() {
  return {
    scope: "full",
    layers: 12,
    layerHeight: 0.65,
    initialRadius: 0.18,
    ratioScale: 1,
    lockSilverRatios: true,
    ratios: silverRatioUnits(1),
    rules: {
      orth1: "b,c,b,v",
      orth2: "",
      diag1: "b,c",
      diag2: "",
      secondary1: "a,a,d",
      secondary2: "",
    },
    phaseSwitchLayer: 0,
    convergenceEvery: 3,
    convergenceStrength: 0.65,
    branchClockOffset: 0,
    branchingType: "star-main",
    starAmplitude: 0.1,
    polygonSmoothing: 0.35,
    branchBoost: 0.12,
    connectionType: "convergent",
  };
}

export const PRESETS = {
  "Haci Kilic (Kayseri)": {
    ...basePreset(),
    layers: 14,
    rules: {
      orth1: "b,c,b,v",
      orth2: "c,b,b,v",
      diag1: "b,c",
      diag2: "c,b",
      secondary1: "a,a,d",
      secondary2: "a,a,d",
    },
    phaseSwitchLayer: 7,
    convergenceEvery: 2,
    convergenceStrength: 0.7,
    branchingType: "star-main",
    connectionType: "convergent",
  },

  "Custom": {
    ...basePreset(),
    layers: 14,
    rules: {
      orth1: "b,c,b,v",
      orth2: "c,b,b,v",
      diag1: "b,c",
      diag2: "c,b",
      secondary1: "a,a,d",
      secondary2: "a,a,d",
    },
    phaseSwitchLayer: 7,
    convergenceEvery: 2,
    convergenceStrength: 0.7,
    branchingType: "star-main",
    connectionType: "convergent",
  },
};

export function clonePreset(name) {
  return JSON.parse(JSON.stringify(PRESETS[name] ?? PRESETS.Custom));
}
