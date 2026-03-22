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
    layers: 12,
    layerHeight: 1,
    heightPattern: "1,1,1",
    ratioScale: 1,
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

export const PRESETS = {
  "Haci Kilic": {
    ...basePreset(),
    rules: {
      orthogonal: "b,c,b,0",
      diagonal: "b,c",
      secondary: "a,a,d",
    },
    connectionType: "convergent",
  },

  "Cifte Minaret": {
    ...basePreset(),
    rules: {
      orthogonal: "a,a,0,0,d,a",
      diagonal: "a,a,d",
      secondary: "b,c,0,0",
    },
    connectionType: "convergent",
  },

  "Sifaiye": {
    ...basePreset(),
    rules: {
      orthogonal: "c,b,b,0",
      diagonal: "c,b",
      secondary: "a,x,0",
    },
    connectionType: "divergent",
  },

  "Gevher Nesibe": {
    ...basePreset(),
    rules: {
      orthogonal: "a,x,0,0,a,0",
      diagonal: "a,x,a",
      secondary: "b,c,b,0",
    },
    connectionType: "convergent",
  },

  "Custom": {
    ...basePreset(),
    rules: {
      orthogonal: "b,c,b,0",
      diagonal: "b,c",
      secondary: "a,a,d",
    },
    connectionType: "convergent",
  },
};

export function clonePreset(name) {
  return JSON.parse(JSON.stringify(PRESETS[name] ?? PRESETS.Custom));
}
