function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

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
