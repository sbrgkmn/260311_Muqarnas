import { generateMuqarnas } from "../src/engine.js";
import { HACI_KILIC_PRESET } from "../src/presets.js";

function parseArgs(argv) {
  const out = {
    phase: 1,
    layers: 4,
    scope: "full",
    strictConnections: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--phase=")) {
      out.phase = Number(arg.slice("--phase=".length)) || 1;
    } else if (arg.startsWith("--layers=")) {
      out.layers = Number(arg.slice("--layers=".length)) || 4;
    } else if (arg.startsWith("--scope=")) {
      out.scope = arg.slice("--scope=".length) || "full";
    } else if (arg === "--strict-connections") {
      out.strictConnections = true;
    }
  }

  out.phase = Math.max(1, Math.min(3, Math.round(out.phase)));
  out.layers = Math.max(2, Math.min(40, Math.round(out.layers)));
  return out;
}

function pointKey(v) {
  return `${v.x.toFixed(6)}|${v.y.toFixed(6)}|${v.z.toFixed(6)}`;
}

function sortByAngle(points) {
  return [...points].sort((a, b) => {
    const aa = Math.atan2(a.y, a.x);
    const bb = Math.atan2(b.y, b.x);
    if (Math.abs(aa - bb) > 1e-9) {
      return aa - bb;
    }
    return Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y);
  });
}

function labelMap(model) {
  const map = new Map();
  for (let layer = 0; layer < model.layers.length; layer += 1) {
    const ordered = sortByAngle(model.layers[layer].points);
    for (let i = 0; i < ordered.length; i += 1) {
      map.set(pointKey(ordered[i]), `${layer}:${i}`);
    }
  }
  return map;
}

function triLabelSet(triangle, labels) {
  return [labels.get(pointKey(triangle.a)), labels.get(pointKey(triangle.b)), labels.get(pointKey(triangle.c))]
    .sort()
    .join("|");
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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function interLayerEdges(triangle) {
  const edges = [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]];
  return edges.filter(([u, v]) => Math.abs(u.z - v.z) > 1e-8);
}

function crossingScore(model) {
  let score = 0;
  for (let layer = 1; layer < model.tileLayers.length; layer += 1) {
    const triangles = model.tileLayers[layer].triangles ?? [];
    const edges = [];
    for (const tri of triangles) {
      edges.push(...interLayerEdges(tri));
    }

    for (let i = 0; i < edges.length; i += 1) {
      const [a, b] = edges[i];
      for (let j = i + 1; j < edges.length; j += 1) {
        const [c, d] = edges[j];
        if (dist(a, c) < 1e-8 || dist(a, d) < 1e-8 || dist(b, c) < 1e-8 || dist(b, d) < 1e-8) {
          continue;
        }
        if (segmentsIntersectStrict2D(a, b, c, d)) {
          score += 1;
        }
      }
    }
  }
  return score;
}

function outwardViolations(model, epsilon = 1e-6) {
  let violations = 0;
  for (let layer = 1; layer < model.tileLayers.length; layer += 1) {
    for (const tri of model.tileLayers[layer].triangles ?? []) {
      for (const [u, v] of interLayerEdges(tri)) {
        const ru = Math.hypot(u.x, u.y);
        const rv = Math.hypot(v.x, v.y);
        if (Math.abs(u.z - v.z) <= 1e-8) {
          continue;
        }
        const upper = u.z > v.z ? u : v;
        const lower = u.z > v.z ? v : u;
        const rUpper = upper === u ? ru : rv;
        const rLower = lower === u ? ru : rv;
        if (rLower + epsilon < rUpper) {
          violations += 1;
        }
      }
    }
  }
  return violations;
}

function childCoverageGaps(model) {
  let gaps = 0;
  for (let layer = 1; layer < model.layers.length; layer += 1) {
    const band = model.tileLayers[layer]?.triangles ?? [];
    const used = new Set();
    for (const tri of band) {
      for (const p of [tri.a, tri.b, tri.c]) {
        if (Math.abs(p.z - model.layers[layer].z) < 1e-8) {
          used.add(pointKey(p));
        }
      }
    }

    for (const p of model.layers[layer].points) {
      if (!used.has(pointKey(p))) {
        gaps += 1;
      }
    }
  }
  return gaps;
}

const PHASE_CONNECTIONS = {
  1: [
    [2, "1:2", "1:3", "2:2"],
    [2, "1:2", "1:1", "2:2"],
    [2, "1:0", "1:2", "2:1"],
  ],
  2: [
    [3, "2:2", "3:6", "3:7"],
    [3, "2:4", "3:7", "3:8"],
    [3, "2:0", "3:0", "3:1"],
  ],
  3: [
    [4, "3:7", "4:7", "4:6"],
    [4, "3:7", "3:6", "4:6"],
    [4, "3:5", "4:4", "4:5"],
    [4, "3:5", "3:4", "4:4"],
  ],
};

function requiredConnectionsForPhase(phase) {
  const out = [];
  for (let i = 1; i <= phase; i += 1) {
    out.push(...(PHASE_CONNECTIONS[i] ?? []));
  }
  return out;
}

function missingConnections(model, phase) {
  const labels = labelMap(model);
  const perLayerSet = new Map();

  for (let layer = 1; layer < model.tileLayers.length; layer += 1) {
    const set = new Set();
    for (const tri of model.tileLayers[layer].triangles ?? []) {
      set.add(triLabelSet(tri, labels));
    }
    perLayerSet.set(layer, set);
  }

  const missing = [];
  for (const [layer, a, b, c] of requiredConnectionsForPhase(phase)) {
    const key = [a, b, c].sort().join("|");
    const present = perLayerSet.get(layer)?.has(key) ?? false;
    if (!present) {
      missing.push({ layer, triangle: `${a} - ${b} - ${c}` });
    }
  }
  return missing;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const model = generateMuqarnas({
    ...HACI_KILIC_PRESET,
    scope: options.scope,
    layers: options.layers,
    triangulationStage: options.phase,
  });

  const crossings = crossingScore(model);
  const outward = outwardViolations(model);
  const coverage = childCoverageGaps(model);
  const missing = missingConnections(model, options.phase);

  console.log(`Phase: ${options.phase}`);
  console.log(`Scope: ${options.scope}`);
  console.log(`Layers: ${options.layers}`);
  console.log(`Triangulation Stage: ${options.phase}`);
  console.log(`Crossing Score: ${crossings}`);
  console.log(`Outward Violations: ${outward}`);
  console.log(`Child Coverage Gaps: ${coverage}`);
  console.log(`Connection Checks (up to phase): ${requiredConnectionsForPhase(options.phase).length}`);
  console.log(`Missing Connections: ${missing.length}`);

  for (const item of missing.slice(0, 20)) {
    console.log(`  - L${item.layer}: ${item.triangle}`);
  }

  const invariantOk = crossings === 0 && outward === 0;
  const connectionOk = options.strictConnections ? missing.length === 0 : true;
  const ok = invariantOk && connectionOk;

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
