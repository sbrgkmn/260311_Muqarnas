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

export function blendRgb(colors, weights) {
  if (!Array.isArray(colors) || !colors.length) {
    return { r: 0, g: 0, b: 0 };
  }

  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let i = 0; i < colors.length; i += 1) {
    const weight = Number(weights?.[i] ?? 1);
    total += weight;
    r += (colors[i]?.r ?? 0) * weight;
    g += (colors[i]?.g ?? 0) * weight;
    b += (colors[i]?.b ?? 0) * weight;
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

export function shadeRgb(color, shade) {
  return {
    r: clamp255((color?.r ?? 0) * shade),
    g: clamp255((color?.g ?? 0) * shade),
    b: clamp255((color?.b ?? 0) * shade),
  };
}

export function rgbToStyle(color, alpha = 1) {
  return `rgba(${clamp255(color?.r ?? 0)}, ${clamp255(color?.g ?? 0)}, ${clamp255(color?.b ?? 0)}, ${alpha})`;
}

export function rgbToUnit(color) {
  return {
    r: clamp255(color?.r ?? 0) / 255,
    g: clamp255(color?.g ?? 0) / 255,
    b: clamp255(color?.b ?? 0) / 255,
  };
}
