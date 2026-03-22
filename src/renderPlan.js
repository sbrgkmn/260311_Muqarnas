import { getScopeRange } from "./engine.js?v=20260321q";
import { hexToRgb, rgbToStyle, shadeRgb, tileTriangleColors, triangleColor } from "./tileColors.js?v=20260321q";

const TRI_TYPE_COLORS = {
  convergent: { r: 189, g: 84, b: 80 },
  divergent: { r: 77, g: 136, b: 201 },
  vertical: { r: 55, g: 152, b: 112 },
  fan: { r: 142, g: 110, b: 192 },
  generic: { r: 158, g: 149, b: 136 },
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVisual(rawVisual) {
  const source = rawVisual ?? {};
  return {
    tileOpacity: clamp(Number(source.tileOpacity) || DEFAULT_VISUAL.tileOpacity, 0.05, 1),
    tileEdgeWidth: clamp(Number(source.tileEdgeWidth) || DEFAULT_VISUAL.tileEdgeWidth, 0.2, 6),
    profileWidth: clamp(Number(source.profileWidth) || DEFAULT_VISUAL.profileWidth, 0.2, 8),
    axisWidth: clamp(Number(source.axisWidth) || DEFAULT_VISUAL.axisWidth, 0.2, 6),
    pointSize: clamp(Number(source.pointSize) || DEFAULT_VISUAL.pointSize, 0.4, 10),
    annotationSize: clamp(Number(source.annotationSize) || DEFAULT_VISUAL.annotationSize, 7, 24),
    showProfiles: source.showProfiles !== false,
    showPointMarkers: source.showPointMarkers !== false,
    showAnnotations: source.showAnnotations !== false,
  };
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function buildVisibleIndices(scope) {
  const { segmentCount, closed } = getScopeRange(scope);
  if (closed) {
    return Array.from({ length: 16 }, (_, i) => i);
  }
  return Array.from({ length: segmentCount + 1 }, (_, i) => i);
}

function scopeMaxAngle(scope) {
  if (scope === "quadrant") {
    return Math.PI / 2;
  }
  if (scope === "half") {
    return Math.PI;
  }
  return Math.PI * 2;
}

function normalizeAngle(angle) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function inScope(point, scope) {
  if (scope === "full") {
    return true;
  }
  const eps = 1e-6;
  if (scope === "quadrant") {
    return point.x >= -eps && point.y >= -eps;
  }
  if (scope === "half") {
    return point.y >= -eps;
  }
  const angle = normalizeAngle(Math.atan2(point.y, point.x));
  return angle <= scopeMaxAngle(scope) + eps;
}

function tileInScope(tile, scope) {
  if (scope === "full") {
    return true;
  }
  return inScope(tile.a, scope) && inScope(tile.b, scope) && inScope(tile.c, scope);
}

function sortPointsByAngle(points) {
  return [...points].sort((a, b) => {
    const aa = Math.atan2(a.y, a.x);
    const bb = Math.atan2(b.y, b.x);
    if (aa !== bb) {
      return aa - bb;
    }
    const ra = Math.hypot(a.x, a.y);
    const rb = Math.hypot(b.x, b.y);
    return ra - rb;
  });
}

function getBoundsFromTiles(tileLayers, scope) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const tileLayer of tileLayers) {
    for (const tile of tileLayer.triangles) {
      if (!tileInScope(tile, scope)) {
        continue;
      }
      for (const vertex of [tile.a, tile.b, tile.c]) {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }

  minX = Math.min(minX, 0);
  maxX = Math.max(maxX, 0);
  minY = Math.min(minY, 0);
  maxY = Math.max(maxY, 0);

  return { minX, maxX, minY, maxY };
}

function getBoundsFromLayers(layers, indices) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const layer of layers) {
    for (const index of indices) {
      const point = layer.points[index];
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }

  return { minX, maxX, minY, maxY };
}

function drawTriangle(ctx, a, b, c, fillStyle, strokeStyle, width = 0.85) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawTiledPlan(ctx, model, scope, toCanvas, center, totalLayers, visual) {
  const tileLayers = model.tileLayers ?? [];
  const maxTileLayer = Math.max(1, tileLayers.length - 1);

  for (const tileLayer of tileLayers) {
    if (tileLayer.layer <= 0) {
      continue;
    }

    const depth = tileLayer.layer / maxTileLayer;
    const alpha = clamp((0.22 + 0.58 * depth) * visual.tileOpacity, 0.08, 1);
    const shade = 0.68 + 0.32 * depth;

    for (const tile of tileLayer.triangles) {
      if (!tileInScope(tile, scope)) {
        continue;
      }

      const a = toCanvas(tile.a);
      const b = toCanvas(tile.b);
      const c = toCanvas(tile.c);
      const base = TRI_TYPE_COLORS[tile.kind] ?? triangleColor(model.axisColors, tile.a, tile.b, tile.c);
      const fill = rgbToStyle(shadeRgb(base, shade), alpha);
      const edge = rgbToStyle(shadeRgb(base, 0.45), 0.78);

      drawTriangle(ctx, a, b, c, fill, edge, visual.tileEdgeWidth);
    }
  }

  const finalLayer = model.layers[model.layers.length - 1];
  for (const point of finalLayer.points) {
    if (!inScope(point, scope)) {
      continue;
    }
    const p = toCanvas(point);
    const color = shadeRgb(hexToRgb(model.axisColors[point.axis]), 0.95);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = rgbToStyle(color, 0.32);
    ctx.lineWidth = visual.axisWidth;
    ctx.stroke();
  }
}

function drawLegacyPlan(ctx, model, scope, toCanvas, center, totalLayers, visual) {
  const { closed } = getScopeRange(scope);
  const indices = buildVisibleIndices(scope);
  const connectionType = model.params?.connectionType === "divergent" ? "divergent" : "convergent";

  for (let layerIndex = 1; layerIndex < model.layers.length; layerIndex += 1) {
    const upper = model.layers[layerIndex - 1].points;
    const lower = model.layers[layerIndex].points;
    const depth = layerIndex / totalLayers;
    const alpha = clamp((0.18 + 0.52 * depth) * visual.tileOpacity, 0.08, 1);
    const shade = 0.72 + 0.28 * depth;
    const edgeAlpha = 0.14 + 0.26 * depth;
    const edge = rgbToStyle({ r: 58, g: 50, b: 43 }, edgeAlpha);

    const segmentTotal = closed ? indices.length : indices.length - 1;
    for (let s = 0; s < segmentTotal; s += 1) {
      const i0 = indices[s];
      const i1 = closed ? indices[(s + 1) % indices.length] : indices[s + 1];

      const p00 = upper[i0];
      const p01 = upper[i1];
      const p10 = lower[i0];
      const p11 = lower[i1];

      const a = toCanvas(p00);
      const b = toCanvas(p01);
      const c = toCanvas(p10);
      const d = toCanvas(p11);

      const [triA, triB] = tileTriangleColors(model.axisColors, p00, p01, p10, p11, connectionType);
      const triAStyle = rgbToStyle(shadeRgb(triA, shade), alpha);
      const triBStyle = rgbToStyle(shadeRgb(triB, shade), alpha);

      if (connectionType === "divergent") {
        drawTriangle(ctx, a, c, b, triAStyle, edge, visual.tileEdgeWidth);
        drawTriangle(ctx, b, c, d, triBStyle, edge, visual.tileEdgeWidth);
      } else {
        drawTriangle(ctx, a, c, d, triAStyle, edge, visual.tileEdgeWidth);
        drawTriangle(ctx, a, d, b, triBStyle, edge, visual.tileEdgeWidth);
      }
    }
  }

  const finalLayer = model.layers[model.layers.length - 1];
  for (const index of indices) {
    const point = finalLayer.points[index];
    const p = toCanvas(point);
    const color = shadeRgb(hexToRgb(model.axisColors[point.axis]), 0.95);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = rgbToStyle(color, 0.38);
    ctx.lineWidth = visual.axisWidth;
    ctx.stroke();
  }
}

function drawLayerProfiles(ctx, model, scope, toCanvas, visual) {
  if (!visual.showProfiles) {
    return;
  }

  const layers = model.layers ?? [];
  if (layers.length <= 1) {
    return;
  }

  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    const depth = layerIndex / Math.max(1, layers.length - 1);
    const ordered = sortPointsByAngle(layers[layerIndex].points.filter((p) => inScope(p, scope)));
    if (ordered.length < 2) {
      continue;
    }

    const { closed } = getScopeRange(scope);
    ctx.beginPath();
    const first = toCanvas(ordered[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ordered.length; i += 1) {
      const p = toCanvas(ordered[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (closed && ordered.length > 2) {
      ctx.closePath();
    }

    ctx.strokeStyle = rgbToStyle({ r: 38, g: 33, b: 27 }, 0.18 + depth * 0.34);
    ctx.lineWidth = visual.profileWidth * (0.78 + depth * 0.55);
    ctx.stroke();
  }
}

function drawPointAnnotations(ctx, model, scope, toCanvas, visual) {
  if (!visual.showPointMarkers && !visual.showAnnotations) {
    return;
  }

  const layers = model.layers ?? [];
  if (layers.length <= 1) {
    return;
  }

  const topLayer = layers.length - 1;
  const labelStart = Math.max(1, topLayer - 1);

  for (let li = 1; li < layers.length; li += 1) {
    const points = sortPointsByAngle(layers[li].points.filter((p) => inScope(p, scope)));
    const depth = li / Math.max(1, topLayer);
    const markerAlpha = li >= labelStart ? 0.92 : 0.4;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const p = toCanvas(point);
      const color = point.pp ? { r: 30, g: 120, b: 96 } : hexToRgb("#2f2a25");

      if (visual.showPointMarkers) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, visual.pointSize * (0.72 + depth * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = rgbToStyle(color, markerAlpha);
        ctx.fill();
      }

      if (visual.showAnnotations && li >= labelStart) {
        ctx.fillStyle = rgbToStyle({ r: 20, g: 20, b: 20 }, 0.88);
        ctx.font = `${visual.annotationSize}px "IBM Plex Sans", sans-serif`;
        ctx.fillText(`${li}:${i}`, p.x + 4, p.y - 4);
      }
    }
  }
}

export function renderPlan(canvas, model, scope, rawVisual = {}) {
  const visual = normalizeVisual(rawVisual);
  const ctx = canvas.getContext("2d");
  const { width, height, dpr } = resizeCanvas(canvas);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!model || !model.layers?.length) {
    return;
  }

  const hasTiles = Array.isArray(model.tileLayers) && model.tileLayers.some((layer) => layer.triangles?.length > 0);
  const indices = buildVisibleIndices(scope);
  const bounds = hasTiles ? getBoundsFromTiles(model.tileLayers, scope) : getBoundsFromLayers(model.layers, indices);

  const pad = 22;
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((cssWidth - pad * 2) / spanX, (cssHeight - pad * 2) / spanY);

  const toCanvas = (point) => {
    const x = pad + (point.x - bounds.minX) * scale;
    const y = cssHeight - (pad + (point.y - bounds.minY) * scale);
    return { x, y };
  };

  const center = toCanvas({ x: 0, y: 0 });
  const totalLayers = Math.max(1, model.layers.length - 1);
  const connectionType = model.params?.connectionType === "divergent" ? "divergent" : "convergent";

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = "#ece3d6";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 6;
    const rx = (cssWidth / 2) * t;
    const ry = (cssHeight / 2) * t;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (hasTiles) {
    drawTiledPlan(ctx, model, scope, toCanvas, center, totalLayers, visual);
  } else {
    drawLegacyPlan(ctx, model, scope, toCanvas, center, totalLayers, visual);
  }
  drawLayerProfiles(ctx, model, scope, toCanvas, visual);
  drawPointAnnotations(ctx, model, scope, toCanvas, visual);

  ctx.fillStyle = "#5f6a6b";
  ctx.font = '12px "IBM Plex Sans", sans-serif';
  const visible = typeof model.visibleLayerCount === "number" ? model.visibleLayerCount : model.params.layers;
  ctx.fillText(`Layers: ${visible}/${model.params.layers}`, 12, 18);
  ctx.fillText(`Scope: ${scope}`, 12, 34);
  ctx.fillText(`Tiles: ${connectionType}`, 12, 50);
}
