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
    layers: 8,
    layerHeight: 1,
    heightPattern: "1,1,1",
    ratioScale: 1,
    ratios: silverRatioUnits(1),
    connectionType: "convergent",
    rules: {
      orthogonal: "b,c,b,0",
      diagonal: "b,c",
      secondary: "a,a,d",
    },
    collisionEpsilon: 0.05,
  };
}

export const HACI_KILIC_PRESET = {
  ...basePreset(),
  id: "haci-kilic",
  name: "Haci Kilic Mosque",
  location: "Kayseri",
  cadence: "Two-layer rhythm, star/polygon alternation",
  sourceFigure: "Fig. 7 / Table 2",
  description: "Repeats every two layers, then switches after layer 6 while preserving the same overall plan distance.",
  layers: 8,
  connectionType: "convergent",
  rules: {
    orthogonal: "b,c,b,v",
    diagonal: "b,c",
    secondary: "a,a,d",
  },
  rulePhases: [
    {
      name: "Layers 1-6",
      fromLayer: 1,
      toLayer: 6,
      rules: {
        orthogonal: "b,c,b,v",
        diagonal: "b,c",
        secondary: "a,a,d",
      },
    },
    {
      name: "Layer 7 onward",
      fromLayer: 7,
      rules: {
        orthogonal: "c,b,b,v",
        diagonal: "c,b",
        secondary: "a,a,d",
      },
    },
  ],
};

export const SIFAIYE_PRESET = {
  ...basePreset(),
  id: "sifaiye",
  name: "Sifaiye Madrasah",
  location: "Sivas",
  cadence: "Three-layer rhythm, secondary-axis convergence",
  sourceFigure: "Fig. 6",
  description: "Uses two staged growth rules. The secondary axis terminates every third layer and produces divergent tile diagonals.",
  layers: 8,
  connectionType: "divergent",
  rules: {
    orthogonal: "c,b,b,v",
    diagonal: "c,b",
    secondary: "a,e,v",
  },
  rulePhases: [
    {
      name: "Growth rule 1, layers 1-4",
      fromLayer: 1,
      toLayer: 4,
      rules: {
        orthogonal: "c,b,b,v",
        diagonal: "c,b",
        secondary: "a,e,v",
      },
    },
    {
      name: "Growth rule 2, layers 5-8",
      fromLayer: 5,
      rules: {
        orthogonal: "b,c,b,v",
        diagonal: "b,c",
        secondary: "a,e,v",
      },
    },
  ],
};

export const CIFTE_MINARELI_PRESET = {
  ...basePreset(),
  id: "cifte-minareli",
  name: "Cifte Minareli Madrasah",
  location: "Sivas",
  cadence: "Quasicrystal branching with primary-axis convergence",
  sourceFigure: "Fig. 8",
  description: "Primary red and blue axes share the a-a-d sequence while secondary branches use b-c-v. Primary star fans consolidate back to one recursive centerline after each branch.",
  layers: 9,
  connectionType: "convergent",
  collisionEpsilon: 0.06,
  convergenceEpsilon: 0.16,
  branchAngles: {
    orthogonal: 180,
    diagonal: 270,
  },
  continueCenterBranchesOnly: true,
  stopSecondaryOnVertical: true,
  stopSecondaryBranches: true,
  rules: {
    orthogonal: "a,a,d",
    diagonal: "a,a,d",
    secondary: "b,c,v",
  },
};

export const GEVHER_NESIBE_PRESET = {
  ...basePreset(),
  id: "gevher-nesibe",
  name: "Gevher Nesibe Madrasah",
  location: "Kayseri",
  cadence: "Three-layer diagonal rhythm with sixth-layer orthogonal sync",
  sourceFigure: "Fig. 9",
  description: "Diagonal growth follows a-e-v, while the orthogonal sequence adds vertical sync steps before restarting.",
  layers: 9,
  connectionType: "convergent",
  collisionEpsilon: 0.04,
  rules: {
    orthogonal: "a,e,v,v,a,v",
    diagonal: "a,e,v",
    secondary: "b,c,b,v",
  },
};

export const PRESETS = {
  "Haci Kilic": HACI_KILIC_PRESET,
  "Sifaiye": SIFAIYE_PRESET,
  "Cifte Minareli": CIFTE_MINARELI_PRESET,
  "Gevher Nesibe": GEVHER_NESIBE_PRESET,
};

export const PRESET_ORDER = [
  "Haci Kilic",
  "Sifaiye",
  "Cifte Minareli",
  "Gevher Nesibe",
];

export function clonePreset(name) {
  return JSON.parse(JSON.stringify(PRESETS[name] ?? HACI_KILIC_PRESET));
}
