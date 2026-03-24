function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

const SHAPE_PALETTE = [
  { r: 208, g: 167, b: 131 },
  { r: 188, g: 144, b: 116 },
  { r: 176, g: 124, b: 102 },
  { r: 217, g: 185, b: 142 },
  { r: 160, g: 129, b: 96 },
  { r: 197, g: 168, b: 124 },
  { r: 146, g: 120, b: 90 },
  { r: 229, g: 201, b: 156 },
  { r: 170, g: 140, b: 110 },
  { r: 203, g: 176, b: 136 },
  { r: 181, g: 150, b: 114 },
  { r: 155, g: 132, b: 103 },
];

export function hexToRgb(hex) {
  const clean = String(hex || "#000000").replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const value = Number.parseInt(normalized, 16);

  if (!Number.isFinite(value)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function blendWeighted(colors, weights) {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let i = 0; i < colors.length; i += 1) {
    const weight = weights[i] ?? 0;
    total += weight;
    r += colors[i].r * weight;
    g += colors[i].g * weight;
    b += colors[i].b * weight;
  }

  if (total <= 0) {
    return { ...colors[0] };
  }

  return {
    r: clamp255(r / total),
    g: clamp255(g / total),
    b: clamp255(b / total),
  };
}

export function blendRgb(colors, weights) {
  return blendWeighted(colors, weights);
}

export function shadeRgb(color, shade) {
  return {
    r: clamp255(color.r * shade),
    g: clamp255(color.g * shade),
    b: clamp255(color.b * shade),
  };
}

export function rgbToStyle(color, alpha = 1) {
  return `rgba(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)}, ${alpha})`;
}

export function rgbToUnit(color) {
  return {
    r: clamp255(color.r) / 255,
    g: clamp255(color.g) / 255,
    b: clamp255(color.b) / 255,
  };
}

function hashString(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sideLength2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleFromSides(adjA, adjB, opposite) {
  const den = Math.max(1e-8, 2 * adjA * adjB);
  const cosValue = (adjA * adjA + adjB * adjB - opposite * opposite) / den;
  const clamped = Math.max(-1, Math.min(1, cosValue));
  return (Math.acos(clamped) * 180) / Math.PI;
}

function angleBucket(degrees) {
  if (degrees < 88) {
    return "a";
  }
  if (degrees <= 92) {
    return "r";
  }
  return "o";
}

function edgeClass(a, b, eps = 1e-6) {
  if (Math.abs(a.z - b.z) > eps) {
    return "x";
  }
  const ra = Math.hypot(a.x, a.y);
  const rb = Math.hypot(b.x, b.y);
  if (Math.abs(ra - rb) <= 1e-4) {
    return "r";
  }
  return "d";
}

export function triangleShapeSignature(a, b, c) {
  const ab = sideLength2D(a, b);
  const bc = sideLength2D(b, c);
  const ca = sideLength2D(c, a);
  const longest = Math.max(ab, bc, ca, 1e-8);

  const ratios = [ab / longest, bc / longest, ca / longest].sort((x, y) => x - y);
  const ratioKey = `${ratios[0].toFixed(2)}-${ratios[1].toFixed(2)}`;

  const A = angleFromSides(ab, ca, bc);
  const B = angleFromSides(ab, bc, ca);
  const C = angleFromSides(bc, ca, ab);
  const angleKey = [angleBucket(A), angleBucket(B), angleBucket(C)].sort().join("");

  const edgeTypes = [edgeClass(a, b), edgeClass(b, c), edgeClass(c, a)].sort().join("");
  return `${angleKey}|${edgeTypes}|${ratioKey}`;
}

export function triangleShapeColor(a, b, c) {
  const signature = triangleShapeSignature(a, b, c);
  const index = hashString(signature) % SHAPE_PALETTE.length;
  return SHAPE_PALETTE[index];
}

export function tileTriangleColors(axisColors, p00, p01, p10, p11, connectionType) {
  const c00 = hexToRgb(axisColors[p00.axis]);
  const c01 = hexToRgb(axisColors[p01.axis]);
  const c10 = hexToRgb(axisColors[p10.axis]);
  const c11 = hexToRgb(axisColors[p11.axis]);

  if (connectionType === "divergent") {
    return [
      blendWeighted([c00, c10, c01], [0.35, 0.4, 0.25]),
      blendWeighted([c01, c10, c11], [0.3, 0.3, 0.4]),
    ];
  }

  return [
    blendWeighted([c00, c10, c11], [0.3, 0.35, 0.35]),
    blendWeighted([c00, c11, c01], [0.3, 0.4, 0.3]),
  ];
}

export function triangleColor(axisColors, a, b, c) {
  const c0 = hexToRgb(axisColors[a.axis]);
  const c1 = hexToRgb(axisColors[b.axis]);
  const c2 = hexToRgb(axisColors[c.axis]);
  return blendWeighted([c0, c1, c2], [1, 1, 1]);
}
