import { BASE_ANGLE_DEG, BRANCH_COUNT, silverRatioUnits } from "./presets.js?v=20260321q";

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
  };
}

function triangleArea3D(a, b, c) {
  const ab = {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z,
  };
  const ac = {
    x: c.x - a.x,
    y: c.y - a.y,
    z: c.z - a.z,
  };
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  return 0.5 * Math.hypot(cross.x, cross.y, cross.z);
}

function pushTriangle(store, a, b, c, kind = "generic") {
  if (!a || !b || !c) {
    return;
  }
  if (triangleArea3D(a, b, c) < 1e-8) {
    return;
  }
  store.push({ a: toVertex(a), b: toVertex(b), c: toVertex(c), kind });
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
  constructor({ x, y, z, v, axis, m, index, parent = null }) {
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

  branch(diagonalRule, secondaryRule, units) {
    const diagonalFirst = diagonalRule[0] ?? "b";
    const secondaryFirst = secondaryRule[0] ?? "a";

    const angle = this.getAngle(secondaryRule, units);
    let dir = rotate(this.v, -(angle / 45) * BASE_ANGLE_DEG);
    const count = Math.max(1, Math.round(angle / BASE_ANGLE_DEG + 1));
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
          return this.branch(diagonal, secondary, units);
        }
        if (heightValue === 0) {
          return this.advance(token, nextIndex, secondary.length, units);
        }
        return this.growLinear(token, this.axis, this.m, nextIndex, units);
      }

      const nextIndex = (this.index + 1) % diagonal.length;
      const token = diagonal[nextIndex];
      if (g % diagonal.length === 0 || isBranchToken(token)) {
        return this.branch(diagonal, secondary, units);
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

function buildEdgePanels(points, connectionType) {
  if (!points.length) {
    return [];
  }
  const triangles = [];
  assignNeighbors(points);

  const baseDivergent = connectionType === "divergent";
  for (const p of points) {
    const q = p.R;
    const pParent = p._meshParent ?? p.parent;
    const qParent = q?._meshParent ?? q?.parent;
    if (!q || !pParent || !qParent) {
      continue;
    }

    const kind = (p.pp || q.pp || dist(p, pParent) < 0.1 || dist(q, qParent) < 0.1) ? "vertical" : connectionType;
    if (pParent === qParent) {
      pushTriangle(triangles, p, q, pParent, "fan");
      continue;
    }

    // Local symmetry rule:
    // split orientation mirrors around the diagonal axis of each 90-degree quadrant.
    let useDivergent = baseDivergent;
    if (kind !== "vertical") {
      const aQ = pointAngle01(q);
      const aP = pointAngle01(p);
      const span = angleDiffCCW(aP, aQ);
      const midAngle = (aQ + span * 0.5) % (Math.PI * 2);
      const local = midAngle % (Math.PI / 2);
      const swapAtDiagonal = local > (Math.PI / 4 + 1e-6);
      if (swapAtDiagonal) {
        useDivergent = !baseDivergent;
      }
    }

    if (useDivergent) {
      // (U_i, U_j, L_i) + (U_j, L_i, L_j)
      pushTriangle(triangles, pParent, qParent, p, kind);
      pushTriangle(triangles, qParent, p, q, kind);
    } else {
      // (U_i, U_j, L_j) + (U_i, L_j, L_i)
      pushTriangle(triangles, pParent, qParent, q, kind);
      pushTriangle(triangles, pParent, q, p, kind);
    }
  }

  return uniqueTriangles(triangles);
}

function pointAngle01(p) {
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

function closestIndexByAngle(points, targetAngle) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = Math.abs(angleDiffCCW(pointAngle01(points[i]), targetAngle));
    const wrapped = Math.min(d, Math.PI * 2 - d);
    if (wrapped < bestDist) {
      bestDist = wrapped;
      best = i;
    }
  }
  return best;
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

function alignContourToReference(contour, reference) {
  if (!contour.length || !reference.length) {
    return [...contour];
  }
  const targetAngle = pointAngle01(reference[0]);
  const start = closestIndexByAngle(contour, targetAngle);
  return rotateFromIndex(contour, start);
}

function mapContourParentsByAngle(contour, reference) {
  if (!contour.length || !reference.length) {
    return;
  }

  const n = reference.length;
  const raw = contour.map((p) => {
    if (p.parent) {
      return closestIndexByAngle(reference, pointAngle01(p.parent));
    }
    return closestIndexByAngle(reference, pointAngle01(p));
  });

  const unwrapped = new Array(raw.length);
  unwrapped[0] = raw[0];
  for (let i = 1; i < raw.length; i += 1) {
    let idx = raw[i];
    while (idx < unwrapped[i - 1]) {
      idx += n;
    }
    unwrapped[i] = idx;
  }

  for (let i = 0; i < contour.length; i += 1) {
    const refIndex = ((unwrapped[i] % n) + n) % n;
    contour[i]._meshParent = reference[refIndex];
  }
}

function clearContourParentMap(contour) {
  for (const p of contour) {
    delete p._meshParent;
  }
}

function inPrimaryQuadrant(point, eps = 1e-6) {
  return point.x >= -eps && point.y >= -eps;
}

function rotateVertexQuarter(vertex, quarterTurns) {
  const angle = quarterTurns * (Math.PI / 2);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = vertex.x * c - vertex.y * s;
  const y = vertex.x * s + vertex.y * c;
  return {
    ...vertex,
    x: Math.abs(x) < 1e-12 ? 0 : x,
    y: Math.abs(y) < 1e-12 ? 0 : y,
    pid: null,
    parentId: null,
  };
}

function swapConnectionType(connectionType) {
  return connectionType === "divergent" ? "convergent" : "divergent";
}

function splitContourAtDiagonal(points) {
  if (points.length <= 2) {
    return { left: [...points], right: [] };
  }

  const pivot = clamp(closestIndexByAngle(points, Math.PI / 4), 1, points.length - 2);
  return {
    left: points.slice(0, pivot + 1),
    right: points.slice(pivot),
  };
}

function verticalKind(connectionType, lowerA, lowerB, upperA, upperB) {
  if (lowerA?.pp || lowerB?.pp) {
    return "vertical";
  }
  if (lowerA && upperA && dist(lowerA, upperA) < 0.1) {
    return "vertical";
  }
  if (lowerB && upperB && dist(lowerB, upperB) < 0.1) {
    return "vertical";
  }
  return connectionType;
}

function triangulateStripByAngle(upperStrip, lowerStrip, connectionType, options = {}) {
  const {
    anchorStart = false,
    anchorEnd = false,
  } = options;

  const triangles = [];
  if (!upperStrip.length || !lowerStrip.length) {
    return triangles;
  }

  const upper = sortByPolar(upperStrip);
  const lower = sortByPolar(lowerStrip);

  if (upper.length === 1) {
    const center = upper[0];
    for (let i = 1; i < lower.length; i += 1) {
      const a = lower[i - 1];
      const b = lower[i];
      const kind = verticalKind(connectionType, a, b, center, center);
      pushTriangle(triangles, center, a, b, kind);
    }
    return triangles;
  }

  if (lower.length === 1) {
    const center = lower[0];
    for (let i = 1; i < upper.length; i += 1) {
      const a = upper[i - 1];
      const b = upper[i];
      const kind = verticalKind(connectionType, center, center, a, b);
      pushTriangle(triangles, a, b, center, kind);
    }
    return triangles;
  }

  let ui = 0;
  let li = 0;

  if (anchorStart && lower.length > 1) {
    const u0 = upper[0];
    const l0 = lower[0];
    const l1 = lower[1];
    const kind = verticalKind(connectionType, l0, l1, u0, u0);
    if (connectionType === "divergent") {
      pushTriangle(triangles, l0, l1, u0, kind);
    } else {
      pushTriangle(triangles, u0, l0, l1, kind);
    }
    li = 1;
  }

  while (ui < upper.length - 1 || li < lower.length - 1) {
    const canAdvanceUpper = ui < upper.length - 1;
    const canAdvanceLower = li < lower.length - 1;
    const u0 = upper[ui];
    const u1 = upper[Math.min(ui + 1, upper.length - 1)];
    const l0 = lower[li];
    const l1 = lower[Math.min(li + 1, lower.length - 1)];

    let advanceUpper = canAdvanceUpper;
    if (canAdvanceUpper && canAdvanceLower) {
      const nextUpperAngle = pointAngle01(u1);
      const nextLowerAngle = pointAngle01(l1);
      // On equal-angle ties, advance the lower strip first so orthogonal-axis
      // anchors are preserved (e.g. 1:0 -> 2:1 mirror pairing).
      advanceUpper = nextUpperAngle + EPS < nextLowerAngle;
    }

    if (advanceUpper) {
      const kind = verticalKind(connectionType, l0, null, u0, u1);
      if (connectionType === "divergent") {
        pushTriangle(triangles, u0, l0, u1, kind);
      } else {
        pushTriangle(triangles, u0, u1, l0, kind);
      }
      ui += 1;
      continue;
    }

    const kind = verticalKind(connectionType, l0, l1, u0, u0);
    if (connectionType === "divergent") {
      pushTriangle(triangles, l0, l1, u0, kind);
    } else {
      pushTriangle(triangles, u0, l0, l1, kind);
    }
    li += 1;
  }

  if (anchorEnd && lower.length > 1) {
    const uLast = upper[upper.length - 1];
    const lPrev = lower[lower.length - 2];
    const lLast = lower[lower.length - 1];
    const kind = verticalKind(connectionType, lPrev, lLast, uLast, uLast);
    if (connectionType === "divergent") {
      pushTriangle(triangles, lPrev, lLast, uLast, kind);
    } else {
      pushTriangle(triangles, uLast, lPrev, lLast, kind);
    }
  }

  return triangles;
}

function trianglePriority(kind) {
  if (kind === "vertical" || kind === "fan") {
    return 3;
  }
  if (kind === "convergent" || kind === "divergent") {
    return 2;
  }
  return 1;
}

function triangleVerticesEqual(a, b) {
  return dist(a, b) < 1e-8;
}

function trianglesShareVertex(t1, t2) {
  const p1 = [t1.a, t1.b, t1.c];
  const p2 = [t2.a, t2.b, t2.c];
  return p1.some((u) => p2.some((v) => triangleVerticesEqual(u, v)));
}

function interLayerEdges(tri) {
  return [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]].filter(([a, b]) => Math.abs(a.z - b.z) > 1e-8);
}

function trianglesCrossInPlan(t1, t2) {
  if (trianglesShareVertex(t1, t2)) {
    return false;
  }
  const edges1 = interLayerEdges(t1);
  const edges2 = interLayerEdges(t2);
  for (const [a, b] of edges1) {
    for (const [c, d] of edges2) {
      if (segmentsIntersectStrict2D(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

function pruneCrossingTriangles(triangles) {
  const out = [...triangles];
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        if (!trianglesCrossInPlan(out[i], out[j])) {
          continue;
        }

        const priA = trianglePriority(out[i].kind);
        const priB = trianglePriority(out[j].kind);
        const areaA = triangleArea3D(out[i].a, out[i].b, out[i].c);
        const areaB = triangleArea3D(out[j].a, out[j].b, out[j].c);

        let removeIndex;
        if (priA !== priB) {
          removeIndex = priA < priB ? i : j;
        } else {
          removeIndex = areaA <= areaB ? i : j;
        }

        out.splice(removeIndex, 1);
        changed = true;
        break outer;
      }
    }
  }

  return out;
}

function buildSymmetricPanelsFromQuadrant(upperContour, lowerContour, connectionType) {
  const upperQ = sortByPolar(upperContour.filter((p) => inPrimaryQuadrant(p)));
  const lowerQ = sortByPolar(lowerContour.filter((p) => inPrimaryQuadrant(p)));
  if (!upperQ.length || !lowerQ.length) {
    return [];
  }

  const upperSplit = splitContourAtDiagonal(upperQ);
  const lowerSplit = splitContourAtDiagonal(lowerQ);

  const buildQuadrant = (rightConnectionType) => {
    const local = [];
    local.push(...triangulateStripByAngle(upperSplit.left, lowerSplit.left, connectionType, {
      anchorStart: true,
    }));
    if (upperSplit.right.length && lowerSplit.right.length) {
      local.push(...triangulateStripByAngle(upperSplit.right, lowerSplit.right, rightConnectionType, {
        anchorEnd: true,
      }));
    }
    return pruneCrossingTriangles(uniqueTriangles(local).filter((t) => !hasCrossingLikeEdge(t)));
  };

  const mirrored = buildQuadrant(swapConnectionType(connectionType));
  const uniform = buildQuadrant(connectionType);
  const mirroredScore = triangulationCrossingScore(mirrored);
  const uniformScore = triangulationCrossingScore(uniform);
  const quadrantTriangles = uniformScore < mirroredScore ? uniform : mirrored;

  const rotated = [];
  for (const tri of quadrantTriangles) {
    for (let k = 0; k < 4; k += 1) {
      rotated.push({
        a: rotateVertexQuarter(tri.a, k),
        b: rotateVertexQuarter(tri.b, k),
        c: rotateVertexQuarter(tri.c, k),
        kind: tri.kind,
      });
    }
  }

  return uniqueTriangles(rotated);
}

function buildRingBandTriangles(upperPoints, lowerPoints, connectionType) {
  const triangles = [];
  if (!upperPoints.length || !lowerPoints.length) {
    return triangles;
  }

  const upper = sortByPolar(upperPoints);
  const lower = sortByPolar(lowerPoints);

  if (upper.length === 1) {
    const c = upper[0];
    for (let i = 0; i < lower.length; i += 1) {
      const a = lower[i];
      const b = lower[(i + 1) % lower.length];
      pushTriangle(triangles, c, a, b);
    }
    return triangles;
  }

  if (lower.length === 1) {
    const c = lower[0];
    for (let i = 0; i < upper.length; i += 1) {
      const a = upper[i];
      const b = upper[(i + 1) % upper.length];
      pushTriangle(triangles, a, b, c);
    }
    return triangles;
  }

  const upperAngles = upper.map(pointAngle01);
  const lowerAngles = lower.map(pointAngle01);

  let i = 0;
  let j = closestIndexByAngle(lower, upperAngles[0]);
  let usedUpper = 0;
  let usedLower = 0;

  while (usedUpper < upper.length || usedLower < lower.length) {
    const iu = i % upper.length;
    const ju = j % lower.length;
    const inext = (iu + 1) % upper.length;
    const jnext = (ju + 1) % lower.length;

    if (usedUpper >= upper.length) {
      pushTriangle(triangles, upper[iu], lower[ju], lower[jnext]);
      j += 1;
      usedLower += 1;
      continue;
    }

    if (usedLower >= lower.length) {
      pushTriangle(triangles, upper[iu], upper[inext], lower[ju]);
      i += 1;
      usedUpper += 1;
      continue;
    }

    const dAdvanceUpper = angleDiffCCW(upperAngles[inext], lowerAngles[ju]);
    const dAdvanceLower = angleDiffCCW(lowerAngles[jnext], upperAngles[iu]);
    const takeUpper = dAdvanceUpper <= dAdvanceLower;

    if (takeUpper) {
      if (connectionType === "divergent") {
        pushTriangle(triangles, upper[iu], lower[ju], upper[inext]);
      } else {
        pushTriangle(triangles, upper[iu], upper[inext], lower[ju]);
      }
      i += 1;
      usedUpper += 1;
    } else {
      if (connectionType === "divergent") {
        pushTriangle(triangles, lower[ju], lower[jnext], upper[iu]);
      } else {
        pushTriangle(triangles, upper[iu], lower[ju], lower[jnext]);
      }
      j += 1;
      usedLower += 1;
    }
  }

  return triangles;
}

function vertexKey(v) {
  return `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
}

function triangleKey(t) {
  const keys = [vertexKey(t.a), vertexKey(t.b), vertexKey(t.c)].sort();
  return keys.join("|");
}

function uniqueTriangles(list) {
  const out = [];
  const seen = new Set();
  for (const tri of list) {
    const key = triangleKey(tri);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tri);
  }
  return out;
}

function pointAngle(p) {
  let a = Math.atan2(p.y, p.x);
  if (a < 0) {
    a += Math.PI * 2;
  }
  return a;
}

function edgeAngularSpan(a, b) {
  const aa = pointAngle(a);
  const bb = pointAngle(b);
  const d = Math.abs(aa - bb);
  return Math.min(d, Math.PI * 2 - d);
}

function hasCrossingLikeEdge(tri) {
  const points = [tri.a, tri.b, tri.c];
  for (let i = 0; i < 3; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % 3];
    const ra = Math.hypot(a.x, a.y);
    const rb = Math.hypot(b.x, b.y);
    if (Math.min(ra, rb) < 0.2) {
      continue;
    }
    if (edgeAngularSpan(a, b) > Math.PI / 2) {
      return true;
    }
  }
  return false;
}

function orientation2D(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersectStrict2D(a, b, c, d, eps = 1e-9) {
  const o1 = orientation2D(a, b, c);
  const o2 = orientation2D(a, b, d);
  const o3 = orientation2D(c, d, a);
  const o4 = orientation2D(c, d, b);
  return (
    ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
    ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
  );
}

function triangulationCrossingScore(triangles) {
  const edges = [];
  for (const tri of triangles) {
    for (const [a, b] of [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]]) {
      if (Math.abs(a.z - b.z) < 1e-8) {
        continue;
      }
      edges.push({ a, b });
    }
  }

  let score = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const e1 = edges[i];
    for (let j = i + 1; j < edges.length; j += 1) {
      const e2 = edges[j];
      if (
        dist(e1.a, e2.a) < 1e-8 ||
        dist(e1.a, e2.b) < 1e-8 ||
        dist(e1.b, e2.a) < 1e-8 ||
        dist(e1.b, e2.b) < 1e-8
      ) {
        continue;
      }
      if (segmentsIntersectStrict2D(e1.a, e1.b, e2.a, e2.b)) {
        score += 1;
      }
    }
  }

  return score;
}

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
  if (scope === "quadrant") {
    return { segmentCount: 4, closed: false };
  }
  if (scope === "half") {
    return { segmentCount: 8, closed: false };
  }
  return { segmentCount: 16, closed: true };
}

export function generateMuqarnas(rawParams) {
  pointId = 1;

  const params = {
    ...rawParams,
    scope: rawParams.scope || "full",
    layers: clamp(Math.round(Number(rawParams.layers) || 12), 1, 120),
    layerHeight: clamp(Number(rawParams.layerHeight) || 1, 0, 5),
    heightPattern: rawParams.heightPattern || "1,1,1",
    ratioScale: clamp(Number(rawParams.ratioScale) || 1, 0.05, 10),
    connectionType: rawParams.connectionType === "divergent" ? "divergent" : "convergent",
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
  const tileLayers = [{ layer: 0, triangles: [] }];
  const axisSegments = [];

  for (let g = 0; g < params.layers; g += 1) {
    const previousContour = rotateContourByLargestGap(extractContourPoints(points));
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
    const contour = alignContourToReference(
      rotateContourByLargestGap(extractContourPoints(checked)),
      previousContour,
    );
    assignNeighbors(contour);
    mapContourParentsByAngle(contour, previousContour);

    let triangles = buildSymmetricPanelsFromQuadrant(previousContour, contour, params.connectionType);

    if (!triangles.length) {
      triangles = buildRingBandTriangles(previousContour, contour, params.connectionType)
        .map((t) => ({ ...t, kind: params.connectionType }))
        .filter((t) => !hasCrossingLikeEdge(t));
    }
    clearContourParentMap(contour);

    tileLayers.push({ layer: g + 1, triangles });

    for (const p of checked) {
      if (!p.parent) {
        continue;
      }
      axisSegments.push({
        layer: g + 1,
        axis: axisKey(p),
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

  return {
    params: {
      ...params,
      rules,
      ratios: units,
      heights,
    },
    layers,
    tileLayers,
    axisSegments,
    axisColors: AXIS_COLORS,
    axisKeys: AXIS,
  };
}
