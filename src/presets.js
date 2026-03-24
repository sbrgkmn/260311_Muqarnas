export const BASE_ANGLE_DEG = 22.5;
export const BRANCH_COUNT = 16;

export function silverRatioUnits(a = 1) {
  const sqrt2 = Math.SQRT2;
  return {
    a,
    b: Math.sqrt(2 - sqrt2) * a,
    c: Math.sqrt(4 - 2 * sqrt2) * a,
    d: (sqrt2 - 1) * a,
    x: (1 + (sqrt2 - 1)) * a,
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
    layers: 3,
    layerHeight: 1,
    heightPattern: "1,1,1",
    ratioScale: 1,
    triangulationStage: 1,
    ratios: silverRatioUnits(1),
    rules: {
      orthogonal: "b,c,b,0",
      diagonal: "b,c",
      secondary: "a,a,d",
    },
    collisionEpsilon: 0.05,
    connectionType: "convergent",
  };
}

export const HACI_KILIC_PRESET = {
  ...basePreset(),
  rules: {
    orthogonal: "b,c,b,0",
    diagonal: "b,c",
    secondary: "a,a,d",
  },
  connectionType: "convergent",
};

export const PRESETS = {
  "Haci Kilic": HACI_KILIC_PRESET,
};

export function clonePreset(name) {
  return JSON.parse(JSON.stringify(PRESETS[name] ?? HACI_KILIC_PRESET));
}
