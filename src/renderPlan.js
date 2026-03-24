import { getScopeRange } from "./engine.js?v=20260324f";
import { hexToRgb, rgbToStyle, shadeRgb, tileTriangleColors, triangleShapeColor } from "./tileColors.js?v=20260324f";

const DEFAULT_VISUAL = {
  tileOpacity: 0.66,
  tileEdgeWidth: 1.1,
  profileWidth: 2.2,
  axisWidth: 1,
  pointSize: 2.4,
  annotationSize: 10,
  showTriangles: false,
  showProfiles: true,
  showPointMarkers: true,
  showAnnotations: false,
  showGrowthArrows: true,
  showGrowthValues: false,
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
    showTriangles: source.showTriangles !== false,
    showProfiles: source.showProfiles !== false,
    showPointMarkers: source.showPointMarkers !== false,
    showAnnotations: source.showAnnotations !== false,
    showGrowthArrows: source.showGrowthArrows !== false,
    showGrowthValues: source.showGrowthValues !== false,
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

function segmentInScope(segment, scope) {
  if (scope === "full") {
    return true;
  }
  const eps = 1e-6;
  const centerX = (segment.a.x + segment.b.x) * 0.5;
  const centerY = (segment.a.y + segment.b.y) * 0.5;
  if (scope === "quadrant") {
    return centerX >= -eps && centerY >= -eps;
  }
  if (scope === "half") {
    return centerY >= -eps;
  }
  const angle = normalizeAngle(Math.atan2(centerY, centerX));
  return angle <= scopeMaxAngle(scope) + eps;
}

function segmentDisplayAxis(segment) {
  if (!segment || !segment.a || !segment.b) {
    return segment?.axis ?? "orthogonal";
  }
  if (segment.axis === "secondary") {
    return "secondary";
  }

  const dx = segment.a.x - segment.b.x;
  const dy = segment.a.y - segment.b.y;
  if (Math.hypot(dx, dy) < 1e-8) {
    return segment.axis;
  }

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }
  const rel90 = Math.min(
    Math.abs(angle - 0),
    Math.abs(angle - 90),
    Math.abs(angle - 180),
    Math.abs(angle - 270),
    Math.abs(angle - 360),
  );
  if (rel90 <= 6) {
    return "orthogonal";
  }
  return segment.axis;
}

function drawAxisSegments(ctx, model, scope, toCanvas, visual, alpha = 0.32) {
  if (!Array.isArray(model.axisSegments) || model.axisSegments.length === 0) {
    return false;
  }

  for (const segment of model.axisSegments) {
    if (!segmentInScope(segment, scope)) {
      continue;
    }
    const a = toCanvas(segment.a);
    const b = toCanvas(segment.b);
    const displayAxis = segmentDisplayAxis(segment);
    const color = shadeRgb(hexToRgb(model.axisColors[displayAxis]), 0.95);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = rgbToStyle(color, alpha);
    ctx.lineWidth = visual.axisWidth;
    ctx.stroke();
  }
  return true;
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
  const alpha = clamp(visual.tileOpacity * 0.9, 0.08, 1);

  for (const tileLayer of tileLayers) {
    if (tileLayer.layer <= 0) {
      continue;
    }

    for (const tile of tileLayer.triangles) {
      if (!tileInScope(tile, scope)) {
        continue;
      }

      const a = toCanvas(tile.a);
      const b = toCanvas(tile.b);
      const c = toCanvas(tile.c);
      const base = triangleShapeColor(tile.a, tile.b, tile.c);
      const fill = rgbToStyle(base, alpha);
      const edge = rgbToStyle(shadeRgb(base, 0.58), 0.78);

      drawTriangle(ctx, a, b, c, fill, edge, visual.tileEdgeWidth);
    }
  }

  drawAxisSegments(ctx, model, scope, toCanvas, visual, 0.32);
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

  if (!drawAxisSegments(ctx, model, scope, toCanvas, visual, 0.38)) {
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

function formatAmount(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) < 1e-6) {
    return "0";
  }
  return Number(value.toFixed(3)).toString();
}

function drawArrowSegment(ctx, from, to, strokeStyle, width = 1) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    return;
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const ux = dx / len;
  const uy = dy / len;
  const head = clamp(3 + width * 2, 4, 10);
  const wing = head * 0.55;
  const bx = to.x - ux * head;
  const by = to.y - uy * head;
  const nx = -uy;
  const ny = ux;

  ctx.fillStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(bx + nx * wing, by + ny * wing);
  ctx.lineTo(bx - nx * wing, by - ny * wing);
  ctx.closePath();
  ctx.fill();
}

function drawGrowthDebug(ctx, model, scope, toCanvas, visual) {
  if (!visual.showGrowthArrows && !visual.showGrowthValues) {
    return;
  }
  const segments = [...(model.axisSegments ?? [])];
  if (!segments.length) {
    return;
  }

  // Draw secondary-axis arrows last so green branching remains visible in dense layers.
  segments.sort((a, b) => {
    const pa = a.axis === "secondary" ? 1 : 0;
    const pb = b.axis === "secondary" ? 1 : 0;
    return pa - pb;
  });

  let maxLayer = 1;
  for (const segment of segments) {
    maxLayer = Math.max(maxLayer, segment.layer ?? 1);
  }

  for (const segment of segments) {
    const child = segment.a;
    const parent = segment.b;
    if (!child || !parent || !inScope(child, scope) || !inScope(parent, scope)) {
      continue;
    }

    const from = toCanvas(parent);
    const to = toCanvas(child);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 2) {
      continue;
    }

    const depth = (segment.layer ?? 1) / maxLayer;
    const displayAxis = segmentDisplayAxis(segment);
    const axisColor = model.axisColors?.[displayAxis] ?? "#5e5447";
    const base = shadeRgb(hexToRgb(axisColor), 0.85);
    const isGreenOnOrth = segment.axis === "secondary" && segment.parentAxis === "orthogonal";
    const alpha = clamp((0.18 + depth * 0.44) + (isGreenOnOrth ? 0.18 : 0), 0.12, 0.85);
    const stroke = rgbToStyle(base, alpha);

    if (visual.showGrowthArrows) {
      const width = isGreenOnOrth
        ? Math.max(1.1, visual.axisWidth * 1.25)
        : Math.max(0.7, visual.axisWidth * 0.85);
      drawArrowSegment(ctx, from, to, stroke, width);
    }

    if (visual.showGrowthValues && child.token) {
      const token = String(child.token).toLowerCase();
      const amount = formatAmount(child.amount);
      const label = `${token}:${amount}`;
      const nx = -dy / len;
      const ny = dx / len;
      const lx = from.x + dx * 0.56 + nx * 5;
      const ly = from.y + dy * 0.56 + ny * 5;
      const fontSize = clamp(visual.annotationSize - 2, 7, 16);

      ctx.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
      const w = ctx.measureText(label).width;
      const h = fontSize + 2;
      ctx.fillStyle = rgbToStyle({ r: 252, g: 248, b: 242 }, 0.82);
      ctx.fillRect(lx - 2, ly - h + 2, w + 4, h);
      ctx.fillStyle = rgbToStyle({ r: 35, g: 31, b: 27 }, 0.92);
      ctx.fillText(label, lx, ly);
    }
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
    const unique = new Map();
    for (const point of layers[li].points) {
      if (!inScope(point, scope)) {
        continue;
      }
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
      if (!unique.has(key)) {
        unique.set(key, point);
      }
    }
    const points = sortPointsByAngle(Array.from(unique.values()));
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

export function renderPlan(canvas, model, scope, rawVisual = {}, viewState = null) {
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
    const raw = {
      x: pad + (point.x - bounds.minX) * scale,
      y: cssHeight - (pad + (point.y - bounds.minY) * scale),
    };

    if (!viewState) {
      return raw;
    }

    const zoom = clamp(Number(viewState.zoom) || 1, 0.35, 8);
    const panX = Number(viewState.panX) || 0;
    const panY = Number(viewState.panY) || 0;
    const cx = cssWidth * 0.5;
    const cy = cssHeight * 0.5;
    return {
      x: (raw.x - cx) * zoom + cx + panX,
      y: (raw.y - cy) * zoom + cy + panY,
    };
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

  if (visual.showTriangles) {
    if (hasTiles) {
      drawTiledPlan(ctx, model, scope, toCanvas, center, totalLayers, visual);
    } else {
      drawLegacyPlan(ctx, model, scope, toCanvas, center, totalLayers, visual);
    }
  } else {
    if (!drawAxisSegments(ctx, model, scope, toCanvas, visual, 0.38)) {
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
  }
  drawLayerProfiles(ctx, model, scope, toCanvas, visual);
  drawGrowthDebug(ctx, model, scope, toCanvas, visual);
  drawPointAnnotations(ctx, model, scope, toCanvas, visual);

  ctx.fillStyle = "#5f6a6b";
  ctx.font = '12px "IBM Plex Sans", sans-serif';
  const visible = typeof model.visibleLayerCount === "number" ? model.visibleLayerCount : model.params.layers;
  ctx.fillText(`Layers: ${visible}/${model.params.layers}`, 12, 18);
  ctx.fillText(`Scope: ${scope}`, 12, 34);
  ctx.fillText(`Tiles: ${connectionType}`, 12, 50);
}
