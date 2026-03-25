import { BASE_ANGLE_DEG, BRANCH_COUNT, silverRatioUnits } from "./presets.js?v=20260325e";

const AXIS = {
  ORTHOGONAL: "orthogonal",
  DIAGONAL: "diagonal",
  SECONDARY: "secondary",
};

const VALID_TOKEN = /^[aAbBcCdDxX0vV]$/;
const EPS = 1e-6;

export const AXIS_COLORS = {
  [AXIS.ORTHOGONAL]: "#d62828",
  [AXIS.DIAGONAL]: "#1d4ed8",
  [AXIS.SECONDARY]: "#0f9d8a",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function norm(vx, vy, fallback = { x: 0, y: 1 }) {
  const len = Math.hypot(vx, vy);
  if (len <= EPS) {
    return { ...fallback };
  }
  return { x: vx / len, y: vy / len };
}

function rotate(v, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function dist(a, b) {
  if (!a || !b) {
    return Infinity;
  }
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dot2(a, b) {
  if (!a || !b) {
    return 0;
  }
  return a.x * b.x + a.y * b.y;
}

function axisKey(point) {
  if (!point) {
    return AXIS.ORTHOGONAL;
  }
  if (!point.m) {
    return AXIS.SECONDARY;
  }
  return point.axis ? AXIS.ORTHOGONAL : AXIS.DIAGONAL;
}

function vectorTo(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
  };
}

function angleBetween(v1, v2) {
  let angle = Math.atan2(v2.y, v2.x) - Math.atan2(v1.y, v1.x);
  if (angle < 0) {
    angle += Math.PI * 2;
  }
  return (angle * 180) / Math.PI;
}

function toVertex(point) {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
    axis: axisKey(point),
    pid: point.id ?? null,
    parentId: point.parent?.id ?? null,
    pp: !!point.pp,
    c: !!point.c,
    token: point.stepToken ?? null,
    amount: Number.isFinite(point.stepAmount) ? point.stepAmount : 0,
    stepType: point.stepType ?? null,
  };
}

function mergeNearPoints(points, epsilon) {
  if (points.length <= 1) {
    return points;
  }

  const out = [];
  for (const point of points) {
    let merged = null;
    for (const existing of out) {
      if (dist(point, existing) < epsilon) {
        merged = existing;
        break;
      }
    }

    if (!merged) {
      out.push(point);
      continue;
    }

    merged.c = merged.c || point.c;
    merged.growing = merged.growing || point.growing;
    if (!merged.parent && point.parent) {
      merged.parent = point.parent;
    }
  }

  return out;
}

function sortByPolar(points) {
  return [...points].sort((a, b) => {
    const aa = Math.atan2(a.y, a.x);
    const bb = Math.atan2(b.y, b.x);
    if (Math.abs(aa - bb) > EPS) {
      return aa - bb;
    }
    const ra = Math.hypot(a.x, a.y);
    const rb = Math.hypot(b.x, b.y);
    return ra - rb;
  });
}

function pointRadius(p) {
  return Math.hypot(p.x, p.y);
}

function angleOf(p) {
  let a = Math.atan2(p.y, p.x);
  if (a < 0) {
    a += Math.PI * 2;
  }
  return a;
}

function angleDiffCCW(to, from) {
  let d = to - from;
  while (d < 0) {
    d += Math.PI * 2;
  }
  while (d >= Math.PI * 2) {
    d -= Math.PI * 2;
  }
  return d;
}

function rotateFromIndex(points, startIndex) {
  const n = points.length;
  if (n <= 1) {
    return [...points];
  }
  const start = ((startIndex % n) + n) % n;
  if (start === 0) {
    return [...points];
  }
  return [...points.slice(start), ...points.slice(0, start)];
}

function extractContourPoints(points, angleTol = 1e-5) {
  if (points.length <= 2) {
    return [...points];
  }

  const sorted = sortByPolar(points);
  const groups = [];

  for (const p of sorted) {
    const a = angleOf(p);
    const last = groups[groups.length - 1];
    if (!last || Math.abs(a - last.angle) > angleTol) {
      groups.push({ angle: a, members: [p] });
    } else {
      last.members.push(p);
    }
  }

  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    const wrapDiff = Math.abs((first.angle + Math.PI * 2) - last.angle);
    if (wrapDiff <= angleTol) {
      first.members.unshift(...last.members);
      groups.pop();
    }
  }

  const contour = groups.map((g) => {
    let rep = g.members[0];
    let maxR = pointRadius(rep);
    for (const p of g.members) {
      const r = pointRadius(p);
      if (r > maxR + EPS) {
        rep = p;
        maxR = r;
      }
    }

    if (g.members.some((p) => p.pp)) {
      rep.pp = true;
    }
    if (g.members.some((p) => p.c)) {
      rep.c = true;
    }
    return rep;
  });

  return sortByPolar(contour);
}

function rotateContourByLargestGap(points) {
  const ordered = sortByPolar(points);
  if (ordered.length <= 2) {
    return ordered;
  }

  let bestStart = 0;
  let maxGap = -1;
  for (let i = 0; i < ordered.length; i += 1) {
    const a0 = angleOf(ordered[i]);
    const a1 = angleOf(ordered[(i + 1) % ordered.length]);
    const gap = angleDiffCCW(a1, a0);
    if (gap > maxGap) {
      maxGap = gap;
      bestStart = (i + 1) % ordered.length;
    }
  }

  return rotateFromIndex(ordered, bestStart);
}

function assignNeighbors(points) {
  if (!points.length) {
    return;
  }
  for (let i = 0; i < points.length; i += 1) {
    points[i].R = points[(i - 1 + points.length) % points.length];
    points[i].L = points[(i + 1) % points.length];
  }
}

function checkCollisions(points, epsilon) {
  if (points.length <= 1) {
    assignNeighbors(points);
    return points;
  }

  const ordered = sortByPolar(points);
  assignNeighbors(ordered);

  for (const p of ordered) {
    if (!p.parent) {
      continue;
    }

    if (dist(p, p.L) < epsilon && dist(p, p.R) < epsilon) {
      const dl = p.L?.parent ? dist(p.parent, p.L.parent) : Infinity;
      const dr = p.R?.parent ? dist(p.parent, p.R.parent) : Infinity;
      if (Math.abs(dl - dr) < epsilon) {
        p.c = true;
        if (p.L) {
          p.L.growing = false;
        }
        if (p.R) {
          p.R.growing = false;
        }
      }
    }

    if (p.parent?.L && dist(p, p.parent.L) < epsilon && dot2(p.v, p.parent.L.v) < 0) {
      p.growing = false;
    }
    if (p.parent?.R && dist(p, p.parent.R) < epsilon && dot2(p.v, p.parent.R.v) < 0) {
      p.growing = false;
    }
  }

  assignNeighbors(ordered);
  return ordered;
}

function isBranchToken(token) {
  return typeof token === "string" && token.length === 1 && token === token.toUpperCase() && token !== token.toLowerCase();
}

function convertToken(token, units) {
  const raw = String(token ?? "").trim();
  if (!raw) {
    return 0;
  }
  const key = raw.toLowerCase();
  if (key === "0" || key === "v") {
    return 0;
  }
  return units[key] ?? 0;
}

export function parseRuleString(raw) {
  if (!raw || typeof raw !== "string") {
    return [];
  }
  return raw
    .replace(/->/g, ",")
    .replace(/>/g, ",")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => token.trim())
    .filter((token) => VALID_TOKEN.test(token));
}

function parseRules(rawRules) {
  const source = rawRules ?? {};
  const orthogonal = parseRuleString(source.orthogonal);
  const diagonal = parseRuleString(source.diagonal);
  const secondary = parseRuleString(source.secondary);

  return {
    orthogonal: orthogonal.length > 0 ? orthogonal : ["b", "c", "b", "0"],
    diagonal: diagonal.length > 0 ? diagonal : ["b", "c"],
    secondary: secondary.length > 0 ? secondary : ["a", "a", "d"],
  };
}

function parseHeightPattern(raw) {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\s,]+/).filter(Boolean)
      : [1, 1, 1];
  const out = values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
  return out.length > 0 ? out : [1, 1, 1];
}

let pointId = 1;

class GrowthPoint {
  constructor({
    x,
    y,
    z,
    v,
    axis,
    m,
    index,
    parent = null,
    stepToken = null,
    stepAmount = 0,
    stepType = null,
  }) {
    this.id = pointId;
    pointId += 1;

    const dir = norm(v.x, v.y);
    this.x = x;
    this.y = y;
    this.z = z;
    this.v = dir;

    this.axis = !!axis;
    this.m = !!m;
    this.index = index;

    this.parent = parent;
    this.children = [];
    this.growing = true;
    this.c = false;
    this.pp = false;
    this.L = null;
    this.R = null;
    this.stepToken = stepToken ? String(stepToken).toLowerCase() : null;
    this.stepAmount = Number.isFinite(stepAmount) ? stepAmount : 0;
    this.stepType = stepType ?? (parent ? "derived" : "root");
  }

  copy(secondLength) {
    const cloned = new GrowthPoint({
      x: this.x,
      y: this.y,
      z: this.z,
      v: this.v,
      axis: this.axis,
      m: this.m,
      index: (this.index + 1) % secondLength,
      parent: this,
      stepToken: "v",
      stepAmount: 0,
      stepType: "copy",
    });
    this.children.push(cloned);
    return cloned;
  }

  growRotate(angleDeg, amountToken, axis, m, index, units) {
    let dir = rotate(this.v, angleDeg);
    dir = norm(dir.x, dir.y, this.v);
    const amount = convertToken(amountToken, units);
    const move = { x: dir.x * amount, y: dir.y * amount };

    const next = new GrowthPoint({
      x: this.x + move.x,
      y: this.y + move.y,
      z: this.z,
      v: dir,
      axis,
      m,
      index,
      parent: this,
      stepToken: amountToken,
      stepAmount: amount,
      stepType: "rotate",
    });

    this.children.push(next);
    return next;
  }

  growLinear(amountToken, axis, m, index, units) {
    const amount = convertToken(amountToken, units);
    const move = {
      x: this.v.x * amount,
      y: this.v.y * amount,
    };

    const next = new GrowthPoint({
      x: this.x + move.x,
      y: this.y + move.y,
      z: this.z,
      v: this.v,
      axis,
      m,
      index,
      parent: this,
      stepToken: amountToken,
      stepAmount: amount,
      stepType: "linear",
    });

    if (Math.abs(amount) < EPS) {
      next.pp = true;
    }

    this.children.push(next);
    return next;
  }

  advance(amountToken, index, secondLength, units) {
    const list = [];
    const moved = this.growLinear(amountToken, this.axis, this.m, index, units);
    this.growing = false;

    const s1 = this.copy(secondLength);
    s1.growing = false;

    const s2 = this.copy(secondLength);
    s2.growing = false;

    list.push(s1, moved, s2);
    return list;
  }

  getAngle(secondRule, units) {
    if (!this.L || !this.R) {
      return 180;
    }

    // For terminated orthogonal points (token 0 / in-place vertical move),
    // measure a one-sided local deflection from the inherited axis direction.
    // Use preserved growth direction (`v`) rather than radial fallback so the
    // branch angle stays consistent with the original red-axis direction.
    if (this.pp && this.axis) {
      const axisDir = norm(this.v.x, this.v.y, this.v);
      const neighbors = [this.L, this.R].filter(Boolean);
      let best = Infinity;
      for (const neighbor of neighbors) {
        const toNeighbor = vectorTo(this, neighbor);
        const delta = angleBetween(axisDir, toNeighbor);
        const local = Math.min(delta, 360 - delta);
        if (local > EPS && local < best) {
          best = local;
        }
      }
      if (Number.isFinite(best)) {
        const snapped = Math.max(BASE_ANGLE_DEG, Math.round(best / BASE_ANGLE_DEG) * BASE_ANGLE_DEG);
        return snapped;
      }
    }

    if (dist(this.L, this.R) < 0.1 && this.parent?.L && this.parent?.R) {
      const v1 = vectorTo(this, this.parent.L);
      const v2 = vectorTo(this, this.parent.R);
      return angleBetween(v2, v1);
    }

    if (secondRule.length > 0 && ((this.L.index + 2) % secondRule.length === 0)) {
      const leftToken = secondRule[(this.L.index + 1) % secondRule.length];
      const rightToken = secondRule[(this.R.index + 1) % secondRule.length];
      const leftStep = convertToken(leftToken, units);
      const rightStep = convertToken(rightToken, units);
      const leftPoint = {
        x: this.L.x + this.L.v.x * leftStep,
        y: this.L.y + this.L.v.y * leftStep,
      };
      const rightPoint = {
        x: this.R.x + this.R.v.x * rightStep,
        y: this.R.y + this.R.v.y * rightStep,
      };
      const v1 = {
        x: this.x - leftPoint.x,
        y: this.y - leftPoint.y,
      };
      const v2 = {
        x: this.x - rightPoint.x,
        y: this.y - rightPoint.y,
      };
      return angleBetween(v2, v1);
    }

    const v1 = vectorTo(this, this.L);
    const v2 = vectorTo(this, this.R);
    return angleBetween(v2, v1);
  }

  branch(diagonalRule, secondaryRule, units, orthogonalRule = []) {
    const diagonalFirst = diagonalRule[0] ?? "b";
    const secondaryFirst = secondaryRule[0] ?? "a";

    // Full-dome orthogonal convergence rule:
    // when a red-axis point has just terminated in place (token 0),
    // spawn two symmetric secondary branches at +/-22.5 degrees AND
    // continue one forward orthogonal advance along the inherited red axis.
    if (this.pp && this.axis) {
      const orthFirstRaw = orthogonalRule[0] ?? "b";
      const orthFirst = isBranchToken(orthFirstRaw) ? "b" : orthFirstRaw;
      const amount = convertToken(secondaryFirst, units);
      const forwardAmount = convertToken(orthFirst, units);
      const dirs = [
        rotate(this.v, -BASE_ANGLE_DEG),
        rotate(this.v, BASE_ANGLE_DEG),
      ];
      const out = [];

      for (const rawDir of dirs) {
        const dir = norm(rawDir.x, rawDir.y, this.v);
        const move = { x: dir.x * amount, y: dir.y * amount };
        const child = new GrowthPoint({
          x: this.x + move.x,
          y: this.y + move.y,
          z: this.z,
          v: dir,
          axis: false,
          m: false,
          index: 0,
          parent: this,
          stepToken: secondaryFirst,
          stepAmount: amount,
          stepType: "branch",
        });
        this.children.push(child);
        out.push(child);
      }

      const forward = new GrowthPoint({
        x: this.x + this.v.x * forwardAmount,
        y: this.y + this.v.y * forwardAmount,
        z: this.z,
        v: this.v,
        axis: true,
        m: true,
        index: 0,
        parent: this,
        stepToken: orthFirst,
        stepAmount: forwardAmount,
        stepType: "branch",
      });
      this.children.push(forward);
      out.push(forward);

      return out;
    }

    const angle = this.getAngle(secondaryRule, units);
    let dir = rotate(this.v, -(angle / 45) * BASE_ANGLE_DEG);
    const baseCount = this.pp && this.axis
      ? angle / BASE_ANGLE_DEG
      : angle / BASE_ANGLE_DEG + 1;
    const count = Math.max(1, Math.round(baseCount));
    const out = [];

    for (let i = 0; i < count; i += 1) {
      dir = norm(dir.x, dir.y, this.v);

      let token;
      if (count % 2 === 0) {
        token = i % 2 === 0 ? diagonalFirst : secondaryFirst;
      } else {
        token = i % 2 === 0 ? secondaryFirst : diagonalFirst;
      }

      let axisBool = this.axis;

      if (this.axis) {
        if ((count - 1) % 8 === 0) {
          axisBool = i % 4 === 0;
          token = i % 2 === 0 ? diagonalFirst : secondaryFirst;
        } else if ((count - 1) % 8 === 4) {
          axisBool = i % 4 !== 0;
          token = i % 2 === 0 ? diagonalFirst : secondaryFirst;
        } else if (count === 3) {
          axisBool = i === 1;
          token = i % 2 === 1 ? diagonalFirst : secondaryFirst;
        } else {
          axisBool = i % 4 !== 1;
          token = i % 2 === 1 ? diagonalFirst : secondaryFirst;
        }
      } else if ((count - 1) % 8 === 0) {
        axisBool = i % 4 !== 0;
        token = i % 2 === 0 ? diagonalFirst : secondaryFirst;
      } else if ((count - 1) % 8 === 4) {
        axisBool = i % 4 === 0;
        token = i % 2 === 0 ? diagonalFirst : secondaryFirst;
      } else if ((count - 1) % 8 === 2) {
        axisBool = i % 4 !== 1;
        token = i % 2 === 1 ? diagonalFirst : secondaryFirst;
      } else {
        axisBool = i % 4 === 1;
        token = i % 2 === 1 ? diagonalFirst : secondaryFirst;
      }

      const amount = convertToken(token, units);
      const move = { x: dir.x * amount, y: dir.y * amount };
      const child = new GrowthPoint({
        x: this.x + move.x,
        y: this.y + move.y,
        z: this.z,
        v: dir,
        axis: axisBool,
        m: (count - 1) % 4 === 0 ? i % 2 === 0 : i % 2 === 1,
        index: 0,
        parent: this,
        stepToken: token,
        stepAmount: amount,
        stepType: "branch",
      });

      this.children.push(child);
      if ((i === 0 || i === count - 1) && (count - 1) % 4 === 0) {
        child.growing = false;
      }

      out.push(child);
      dir = rotate(move, BASE_ANGLE_DEG);
    }

    return out;
  }

  checkGrowth(g, context) {
    const {
      orthogonal,
      diagonal,
      secondary,
      heightValue,
      units,
    } = context;

    if (this.m) {
      if (this.axis) {
        const nextIndex = (this.index + 1) % orthogonal.length;
        const token = orthogonal[nextIndex];
        if (nextIndex === 0 || isBranchToken(token)) {
          return this.branch(diagonal, secondary, units, orthogonal);
        }
        if (heightValue === 0) {
          return this.advance(token, nextIndex, secondary.length, units);
        }
        return this.growLinear(token, this.axis, this.m, nextIndex, units);
      }

      const nextIndex = (this.index + 1) % diagonal.length;
      const token = diagonal[nextIndex];
      if (g % diagonal.length === 0 || isBranchToken(token)) {
        return this.branch(diagonal, secondary, units, orthogonal);
      }
      if (heightValue === 0) {
        return this.advance(token, nextIndex, secondary.length, units);
      }
      return this.growLinear(token, this.axis, this.m, nextIndex, units);
    }

    const nextIndex = (this.index + 1) % secondary.length;
    const token = secondary[nextIndex];
    const grown = this.growLinear(token, this.axis, this.m, nextIndex, units);
    if ((g % diagonal.length) % secondary.length === 0) {
      grown.growing = false;
    }
    return grown;
  }
}

// Triangulation pipeline removed intentionally.
// We will rebuild triangle generation from scratch in a dedicated pass.

function moveVertical(points, amount) {
  for (const p of points) {
    p.z += amount;
  }
}

function enforceOutwardMonotonic(points, epsilon = 1e-5) {
  for (const p of points) {
    if (!p.parent) {
      continue;
    }
    const parentRadius = Math.hypot(p.parent.x, p.parent.y);
    const childRadius = Math.hypot(p.x, p.y);
    if (childRadius + epsilon >= parentRadius) {
      continue;
    }

    let angle = Math.atan2(p.y, p.x);
    if (Math.abs(childRadius) < EPS) {
      angle = Math.atan2(p.parent.y, p.parent.x);
    }
    const targetRadius = parentRadius;
    p.x = Math.cos(angle) * targetRadius;
    p.y = Math.sin(angle) * targetRadius;

    const dx = p.x - p.parent.x;
    const dy = p.y - p.parent.y;
    p.v = norm(dx, dy, p.v);
  }
}

function buildLayerSnapshot(points, layer) {
  const z = points.length ? points[0].z : 0;
  const visiblePoints = points.map((p) => toVertex(p));
  const branchCount = points.filter((p) => p.m).length;
  return { layer, z, branchCount, points: visiblePoints };
}

function buildUnits(rawParams) {
  const baseA = clamp(Number(rawParams?.ratios?.a) || 1, 0.1, 5);
  const ratioScale = clamp(Number(rawParams?.ratioScale) || 1, 0.05, 10);
  const units = silverRatioUnits(baseA);
  for (const key of Object.keys(units)) {
    units[key] *= ratioScale;
  }
  return units;
}

export function getScopeRange(scope) {
  // Rebuild mode: always operate as full dome.
  return { segmentCount: 16, closed: true };
}

export function generateMuqarnas(rawParams) {
  pointId = 1;

  const params = {
    ...rawParams,
    scope: "full",
    layers: clamp(Math.round(Number(rawParams.layers) || 12), 1, 120),
    layerHeight: clamp(Number(rawParams.layerHeight) || 1, 0, 5),
    heightPattern: rawParams.heightPattern || "1,1,1",
    ratioScale: clamp(Number(rawParams.ratioScale) || 1, 0.05, 10),
    collisionEpsilon: clamp(Number(rawParams.collisionEpsilon) || 0.05, 0.005, 1),
  };

  const units = buildUnits(params);
  const rules = parseRules(params.rules);
  const heights = parseHeightPattern(params.heightPattern);

  const root = new GrowthPoint({
    x: 0,
    y: 0,
    z: 0,
    v: { x: 0, y: 1 },
    axis: true,
    m: true,
    index: 0,
    parent: null,
  });

  let points = [root];
  const layers = [buildLayerSnapshot(points, 0)];
  const axisSegments = [];

  for (let g = 0; g < params.layers; g += 1) {
    const next = [];
    const heightValue = heights[g % heights.length];

    if (g === 0) {
      for (let i = 0; i < BRANCH_COUNT; i += 1) {
        const token = i % 2 === 0 ? rules.diagonal[0] : rules.secondary[0];
        next.push(root.growRotate(i * BASE_ANGLE_DEG, token, i % 4 === 0, i % 2 === 0, 0, units));
      }
    } else {
      for (const p of points) {
        if (!p.growing) {
          continue;
        }
        const grown = p.checkGrowth(g, {
          orthogonal: rules.orthogonal,
          diagonal: rules.diagonal,
          secondary: rules.secondary,
          heightValue,
          units,
        });

        if (Array.isArray(grown)) {
          next.push(...grown);
        } else if (grown) {
          next.push(grown);
        }
      }
    }

    moveVertical(next, -heightValue * params.layerHeight);
    enforceOutwardMonotonic(next);
    const checked = checkCollisions(next, params.collisionEpsilon);

    for (const p of checked) {
      if (!p.parent) {
        continue;
      }
      axisSegments.push({
        layer: g + 1,
        axis: axisKey(p),
        parentAxis: axisKey(p.parent),
        a: toVertex(p),
        b: toVertex(p.parent),
      });
    }

    points = checked;
    layers.push(buildLayerSnapshot(points, g + 1));

    if (!points.length) {
      break;
    }
  }

  const model = {
    params: {
      ...params,
      rules,
      ratios: units,
      heights,
    },
    layers,
    tileLayers: [],
    axisSegments,
    axisColors: AXIS_COLORS,
    axisKeys: AXIS,
  };
  return model;
}
