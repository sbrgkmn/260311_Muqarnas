import { BASE_ANGLE_DEG, BRANCH_COUNT, silverRatioUnits } from "./presets.js";

const AXIS = {
  ORTHOGONAL: "orthogonal",
  DIAGONAL: "diagonal",
  SECONDARY: "secondary",
};

const VALID_TOKENS = new Set(["a", "b", "c", "d", "e", "f", "g", "v"]);

export const AXIS_COLORS = {
  [AXIS.ORTHOGONAL]: "#d62828",
  [AXIS.DIAGONAL]: "#1d4ed8",
  [AXIS.SECONDARY]: "#0f9d8a",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function blend(a, b, t) {
  return a * (1 - t) + b * t;
}

function normalizeIndex(index) {
  return ((index % BRANCH_COUNT) + BRANCH_COUNT) % BRANCH_COUNT;
}

function indexToAngle(index) {
  return (normalizeIndex(index) * BASE_ANGLE_DEG * Math.PI) / 180;
}

function axisForBranch(index, offset) {
  const shifted = normalizeIndex(index + offset);
  if (shifted % 2 === 1) {
    return AXIS.SECONDARY;
  }
  if (shifted % 4 === 0) {
    return AXIS.ORTHOGONAL;
  }
  return AXIS.DIAGONAL;
}

function usePhaseTwo(layer, phaseSwitchLayer) {
  return phaseSwitchLayer > 0 && layer >= phaseSwitchLayer;
}

export function parseRuleString(raw) {
  if (!raw || typeof raw !== "string") {
    return [];
  }

  return raw
    .toLowerCase()
    .replace(/->/g, ",")
    .replace(/>/g, ",")
    .split(/[\s,]+/)
    .filter(Boolean)
    .filter((token) => VALID_TOKENS.has(token));
}

function parseRules(rawRules) {
  const safeRules = rawRules ?? {};
  return {
    orth1: parseRuleString(safeRules.orth1),
    orth2: parseRuleString(safeRules.orth2),
    diag1: parseRuleString(safeRules.diag1),
    diag2: parseRuleString(safeRules.diag2),
    secondary1: parseRuleString(safeRules.secondary1),
    secondary2: parseRuleString(safeRules.secondary2),
  };
}

function selectRule(rules, axis, phaseTwo) {
  if (axis === AXIS.ORTHOGONAL) {
    return phaseTwo && rules.orth2.length > 0 ? rules.orth2 : rules.orth1;
  }
  if (axis === AXIS.DIAGONAL) {
    return phaseTwo && rules.diag2.length > 0 ? rules.diag2 : rules.diag1;
  }
  return phaseTwo && rules.secondary2.length > 0 ? rules.secondary2 : rules.secondary1;
}

function normalizeRatios(params) {
  const baseA = clamp(Number(params.ratios?.a) || 1, 0.1, 5);
  if (params.lockSilverRatios !== false) {
    return silverRatioUnits(baseA);
  }

  const out = { ...params.ratios };
  for (const key of ["a", "b", "c", "d", "e", "f", "g"]) {
    out[key] = clamp(Number(out[key]) || 0.1, 0.01, 5);
  }
  return out;
}

function nonVerticalPrefix(rule, size = 2) {
  const items = (rule ?? []).filter((token) => token !== "v");
  if (items.length < size) {
    return null;
  }
  return items.slice(0, size);
}

function parseTrigger(raw, fallbackTokens) {
  if (!raw || typeof raw !== "string") {
    return fallbackTokens;
  }
  const parsed = parseRuleString(raw).filter((token) => token !== "v");
  if (parsed.length < 2) {
    return fallbackTokens;
  }
  return parsed.slice(0, 2);
}

function parseMultipliers(raw) {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\s,]+/).filter(Boolean)
      : [];

  const out = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value))
    .filter((value) => value > 0 && value < BRANCH_COUNT)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a - b);

  return out.length > 0 ? out : [2];
}

function pushTrail(trail, token, maxLength) {
  if (!token || token === "v") {
    return;
  }
  trail.push(token);
  while (trail.length > maxLength) {
    trail.shift();
  }
}

function matchesTrail(trail, trigger) {
  if (!trigger || trigger.length === 0 || trail.length < trigger.length) {
    return false;
  }

  const start = trail.length - trigger.length;
  for (let i = 0; i < trigger.length; i += 1) {
    if (trail[start + i] !== trigger[i]) {
      return false;
    }
  }
  return true;
}

function sortNodesByAngle(nodes) {
  return [...nodes].sort((a, b) => a.angle - b.angle || a.index - b.index);
}

function applyConvergence(nodes, layer, params) {
  if (params.convergenceEvery <= 0 || layer % params.convergenceEvery !== 0) {
    return;
  }

  const ordered = sortNodesByAngle(nodes);
  for (let i = 0; i < ordered.length; i += 1) {
    const node = ordered[i];
    if (node.axis !== AXIS.SECONDARY) {
      continue;
    }
    const left = ordered[(i - 1 + ordered.length) % ordered.length];
    const right = ordered[(i + 1) % ordered.length];
    const target = (left.radius + right.radius) * 0.5;
    node.radius = blend(node.radius, target, params.convergenceStrength);
  }
}

function applyMorphology(nodes, layer, params) {
  const ordered = sortNodesByAngle(nodes);
  const [shape, focus] = String(params.branchingType || "star-main").split("-");

  const isTarget = (node) => {
    const isSecondary = node.axis === AXIS.SECONDARY;
    if (focus === "secondary") {
      return isSecondary;
    }
    return !isSecondary;
  };

  if (shape === "star") {
    const sign = layer % 2 === 0 ? 1 : -1;
    for (const node of ordered) {
      if (!isTarget(node)) {
        continue;
      }
      node.radius *= 1 + sign * params.starAmplitude;
      node.radius = Math.max(0.02, node.radius);
    }
    return;
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const node = ordered[i];
    if (!isTarget(node)) {
      continue;
    }

    const left = ordered[(i - 1 + ordered.length) % ordered.length];
    const right = ordered[(i + 1) % ordered.length];
    const avg = (left.radius + right.radius) * 0.5;
    node.radius = blend(node.radius, avg, params.polygonSmoothing);
  }
}

function euclidean2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function point2D(node, radiusOverride = null) {
  const radius = radiusOverride == null ? node.radius : radiusOverride;
  return {
    x: Math.cos(node.angle) * radius,
    y: Math.sin(node.angle) * radius,
  };
}

function applyNeighborCollisionStop(nodes, params) {
  const minGap = params.collisionMinGap;
  let count = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const dist = euclidean2D(point2D(a), point2D(b));
    if (dist >= minGap) {
      continue;
    }

    const shared = (a.radius + b.radius) * 0.5;
    a.radius = shared;
    b.radius = shared;
    a.freeze = Math.max(a.freeze, params.collisionFreezeLayers);
    b.freeze = Math.max(b.freeze, params.collisionFreezeLayers);
    count += 1;
  }
  return count;
}

function makeNode(index, params, ratios) {
  const axis = axisForBranch(index, params.branchClockOffset);
  const radius = params.initialRadius * ratios.a;
  return {
    index,
    angle: indexToAngle(index),
    axis,
    radius,
    prevRadius: radius,
    progressA: 0,
    progressB: 0,
    trail: [],
    freeze: 0,
  };
}

function stepNode(node, rules, phaseTwo, ratios, params, triggersByAxis) {
  const sequence = selectRule(rules, node.axis, phaseTwo);
  if (sequence.length === 0) {
    return { delta: 0, triggered: false };
  }

  const cursorKey = phaseTwo ? "progressB" : "progressA";
  const cursor = node[cursorKey];
  const token = sequence[cursor % sequence.length];
  node[cursorKey] += 1;

  let delta = token === "v" ? 0 : (ratios[token] || 0) * params.ratioScale;
  if (params.branchBoost > 0 && node[cursorKey] % sequence.length === 0) {
    delta += ratios.d * params.branchBoost;
  }

  const trigger = triggersByAxis[node.axis] ?? null;
  pushTrail(node.trail, token, 2);
  const triggered = (node.axis === AXIS.DIAGONAL || node.axis === AXIS.ORTHOGONAL) && matchesTrail(node.trail, trigger);

  return { delta, triggered };
}

function buildLayerSnapshot(nodes, layer, layerHeight) {
  const z = -layer * layerHeight;
  return {
    layer,
    z,
    branchCount: nodes.filter((node) => node.axis !== AXIS.SECONDARY).length,
    points: nodes.map((node) => ({
      x: Math.cos(node.angle) * node.radius,
      y: Math.sin(node.angle) * node.radius,
      z,
      radius: node.radius,
      angle: node.angle,
      axis: node.axis,
    })),
  };
}

function triangleArea(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function buildTileLayer(upperPoints, lowerPoints, layer, connectionType) {
  const triangles = [];

  for (let i = 0; i < BRANCH_COUNT; i += 1) {
    const i0 = i;
    const i1 = (i + 1) % BRANCH_COUNT;

    const p00 = upperPoints[i0];
    const p01 = upperPoints[i1];
    const p10 = lowerPoints[i0];
    const p11 = lowerPoints[i1];

    if (connectionType === "divergent") {
      if (triangleArea(p00, p10, p01) > 1e-8) {
        triangles.push({ a: p00, b: p10, c: p01 });
      }
      if (triangleArea(p01, p10, p11) > 1e-8) {
        triangles.push({ a: p01, b: p10, c: p11 });
      }
    } else {
      if (triangleArea(p00, p10, p11) > 1e-8) {
        triangles.push({ a: p00, b: p10, c: p11 });
      }
      if (triangleArea(p00, p11, p01) > 1e-8) {
        triangles.push({ a: p00, b: p11, c: p01 });
      }
    }
  }

  return { layer, triangles };
}

export function getScopeRange(scope) {
  if (scope === "quadrant") {
    return { segmentCount: 4, closed: false };
  }
  if (scope === "half") {
    return { segmentCount: 8, closed: false };
  }
  return { segmentCount: 16, closed: true };
}

export function generateMuqarnas(rawParams) {
  const params = {
    ...rawParams,
    layers: clamp(Number(rawParams.layers) || 10, 2, 60),
    layerHeight: clamp(Number(rawParams.layerHeight) || 0.6, 0.03, 5),
    ratioScale: clamp(Number(rawParams.ratioScale) || 1, 0.05, 5),
    initialRadius: clamp(Number(rawParams.initialRadius) || 0.15, 0.01, 5),
    phaseSwitchLayer: Math.max(0, Number(rawParams.phaseSwitchLayer) || 0),
    convergenceEvery: Math.max(0, Number(rawParams.convergenceEvery) || 0),
    convergenceStrength: clamp(Number(rawParams.convergenceStrength) || 0, 0, 1),
    branchClockOffset: ((Number(rawParams.branchClockOffset) || 0) % BRANCH_COUNT + BRANCH_COUNT) % BRANCH_COUNT,
    branchingType: rawParams.branchingType || "star-main",
    starAmplitude: clamp(Number(rawParams.starAmplitude) || 0, 0, 0.5),
    polygonSmoothing: clamp(Number(rawParams.polygonSmoothing) || 0, 0, 1),
    branchBoost: clamp(Number(rawParams.branchBoost) || 0, 0, 2),
    connectionType: rawParams.connectionType === "divergent" ? "divergent" : "convergent",
    branchAngleMultipliers: parseMultipliers(rawParams.patternAngleMultipliers),
    branchImpulseScale: clamp(Number(rawParams.branchImpulseScale) || 0.72, 0, 2),
    maxImpulsePerLayer: clamp(Math.round(Number(rawParams.maxImpulsePerLayer) || 96), 0, 1000),
    collisionFreezeLayers: clamp(Math.round(Number(rawParams.collisionFreezeLayers) || 1), 0, 8),
  };

  const ratios = normalizeRatios(params);
  params.ratios = ratios;
  params.collisionMinGap = clamp(
    Number(rawParams.collisionMinGap) || params.initialRadius * ratios.b * 0.9,
    1e-4,
    100,
  );

  const rules = parseRules(params.rules);

  const defaultDiagTrigger = nonVerticalPrefix(rules.diag1, 2) || nonVerticalPrefix(rules.diag2, 2) || ["b", "c"];
  const defaultOrthTrigger = nonVerticalPrefix(rules.orth1, 2) || nonVerticalPrefix(rules.orth2, 2) || ["b", "c"];

  const triggersByAxis = {
    [AXIS.DIAGONAL]: parseTrigger(rawParams.patternTriggerDiag, defaultDiagTrigger),
    [AXIS.ORTHOGONAL]: parseTrigger(rawParams.patternTriggerOrth, defaultOrthTrigger),
    [AXIS.SECONDARY]: null,
  };

  const nodes = Array.from({ length: BRANCH_COUNT }, (_, index) => makeNode(index, params, ratios));
  const layers = [buildLayerSnapshot(nodes, 0, params.layerHeight)];
  const tileLayers = [{ layer: 0, triangles: [] }];
  const collisionLayers = [{ layer: 0, impulseCollisions: 0, neighborCollisions: 0 }];

  for (let layer = 1; layer <= params.layers; layer += 1) {
    const phaseTwo = usePhaseTwo(layer, params.phaseSwitchLayer);
    const impulseBuckets = Array.from({ length: BRANCH_COUNT }, () => []);
    let emitted = 0;

    for (const node of nodes) {
      node.prevRadius = node.radius;
    }

    for (const node of nodes) {
      const frozen = node.freeze > 0;
      if (frozen) {
        node.freeze -= 1;
      }

      const { delta, triggered } = stepNode(node, rules, phaseTwo, ratios, params, triggersByAxis);
      const advance = frozen ? 0 : delta;
      node.radius = Math.max(0.02, node.radius + advance);

      if (!triggered || emitted >= params.maxImpulsePerLayer) {
        continue;
      }

      for (const multiplier of params.branchAngleMultipliers) {
        for (const sign of [-1, 1]) {
          if (emitted >= params.maxImpulsePerLayer) {
            break;
          }
          const targetIndex = normalizeIndex(node.index + sign * multiplier);
          const targetAxis = axisForBranch(targetIndex, params.branchClockOffset);
          if (targetAxis === AXIS.SECONDARY) {
            continue;
          }
          impulseBuckets[targetIndex].push({
            axis: targetAxis,
            magnitude: advance * params.branchImpulseScale,
          });
          emitted += 1;
        }
      }
    }

    for (let i = 0; i < BRANCH_COUNT; i += 1) {
      const impacts = impulseBuckets[i];
      if (impacts.length === 0) {
        continue;
      }

      const node = nodes[i];
      if (impacts.length === 1) {
        if (node.freeze === 0) {
          node.radius = Math.max(0.02, node.radius + impacts[0].magnitude);
        }
        node.axis = impacts[0].axis;
        continue;
      }

      node.radius = Math.min(node.radius, node.prevRadius);
      node.freeze = Math.max(node.freeze, params.collisionFreezeLayers);

      const baseline = axisForBranch(i, params.branchClockOffset);
      node.axis = baseline === AXIS.SECONDARY ? AXIS.ORTHOGONAL : baseline;
      node.trail = [];
    }

    let impulseCollisions = 0;
    for (const impacts of impulseBuckets) {
      if (impacts.length > 1) {
        impulseCollisions += 1;
      }
    }

    const neighborCollisions = applyNeighborCollisionStop(nodes, params);
    applyConvergence(nodes, layer, params);
    applyMorphology(nodes, layer, params);

    for (const node of nodes) {
      node.radius = Math.max(0.02, node.radius);
    }

    const snapshot = buildLayerSnapshot(nodes, layer, params.layerHeight);
    const prevSnapshot = layers[layers.length - 1];
    tileLayers.push(buildTileLayer(prevSnapshot.points, snapshot.points, layer, params.connectionType));
    collisionLayers.push({ layer, impulseCollisions, neighborCollisions });
    layers.push(snapshot);
  }

  return {
    params: {
      ...params,
      ratios,
      rules,
      triggersByAxis,
    },
    layers,
    tileLayers,
    collisionLayers,
    axisColors: AXIS_COLORS,
    axisKeys: AXIS,
  };
}
