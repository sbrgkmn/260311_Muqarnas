import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { getScopeRange } from "./engine.js?v=20260321q";
import { rgbToUnit, shadeRgb, tileTriangleColors, triangleColor } from "./tileColors.js?v=20260321q";

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
  showProfiles: true,
  showPointMarkers: true,
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
    showProfiles: source.showProfiles !== false,
    showPointMarkers: source.showPointMarkers !== false,
  };
}

function vector(point) {
  return new THREE.Vector3(point.x, point.z, point.y);
}

function visibleIndices(scope) {
  const { segmentCount, closed } = getScopeRange(scope);
  if (closed) {
    return { indices: Array.from({ length: 16 }, (_, i) => i), closed: true };
  }
  return { indices: Array.from({ length: segmentCount + 1 }, (_, i) => i), closed: false };
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

function tileInScope(tile, scope) {
  if (scope === "full") {
    return true;
  }
  const vertices = [tile.a, tile.b, tile.c];
  return vertices.every((point) => pointInScope(point, scope));
}

function pointInScope(point, scope) {
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

function pushTriangle(store, a, b, c, color) {
  store.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  store.colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
}

export class Muqarnas3DView {
  constructor(root) {
    this.root = root;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#fffaf4");

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500);
    this.camera.position.set(10, 9, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    root.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, -2, 0);

    const ambient = new THREE.HemisphereLight("#fff8e8", "#493a2e", 1.0);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffffff", 0.8);
    key.position.set(8, 12, 9);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight("#f7f1dd", 0.45);
    fill.position.set(-7, 6, -5);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.grid = new THREE.GridHelper(24, 24, "#dbcdb8", "#eee3d5");
    this.grid.position.y = -8;
    this.scene.add(this.grid);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    this.resize();
  }

  disposeGroup() {
    while (this.group.children.length) {
      const child = this.group.children.pop();
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }

  buildMeshFromTileLayers(model, scope, visual) {
    const triangles = { positions: [], colors: [] };
    const tileLayers = model.tileLayers ?? [];
    const maxTileLayer = Math.max(1, tileLayers.length - 1);

    for (const tileLayer of tileLayers) {
      if (tileLayer.layer <= 0) {
        continue;
      }

      const depth = tileLayer.layer / maxTileLayer;
      const shade = 0.68 + 0.32 * depth;

      for (const tile of tileLayer.triangles) {
        if (!tileInScope(tile, scope)) {
          continue;
        }

        const a = vector(tile.a);
        const b = vector(tile.b);
        const c = vector(tile.c);

        const base = TRI_TYPE_COLORS[tile.kind] ?? triangleColor(model.axisColors, tile.a, tile.b, tile.c);
        const color = rgbToUnit(shadeRgb(base, shade));
        pushTriangle(triangles, a, b, c, color);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(triangles.colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.08,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: visual.tileOpacity,
    });

    return new THREE.Mesh(geometry, material);
  }

  buildLegacyMesh(model, scope, connectionType, visual) {
    const { indices, closed } = visibleIndices(scope);
    const triangles = { positions: [], colors: [] };
    const totalLayers = Math.max(1, model.layers.length - 1);

    for (let layer = 1; layer < model.layers.length; layer += 1) {
      const upper = model.layers[layer - 1].points;
      const lower = model.layers[layer].points;
      const depth = layer / totalLayers;
      const shade = 0.72 + 0.28 * depth;

      const segmentTotal = closed ? indices.length : indices.length - 1;
      for (let s = 0; s < segmentTotal; s += 1) {
        const i0 = indices[s];
        const i1 = closed ? indices[(s + 1) % indices.length] : indices[s + 1];

        const p00 = upper[i0];
        const p01 = upper[i1];
        const p10 = lower[i0];
        const p11 = lower[i1];

        const v00 = vector(p00);
        const v01 = vector(p01);
        const v10 = vector(p10);
        const v11 = vector(p11);

        const [triA, triB] = tileTriangleColors(model.axisColors, p00, p01, p10, p11, connectionType);
        const triAColor = rgbToUnit(shadeRgb(triA, shade));
        const triBColor = rgbToUnit(shadeRgb(triB, shade));

        if (connectionType === "divergent") {
          pushTriangle(triangles, v00, v10, v01, triAColor);
          pushTriangle(triangles, v01, v10, v11, triBColor);
        } else {
          pushTriangle(triangles, v00, v10, v11, triAColor);
          pushTriangle(triangles, v00, v11, v01, triBColor);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(triangles.colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.08,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: visual.tileOpacity,
    });

    return new THREE.Mesh(geometry, material);
  }

  buildMesh(model, scope, connectionType, visual) {
    const hasTileLayers = Array.isArray(model.tileLayers) && model.tileLayers.some((layer) => layer.triangles?.length > 0);
    if (hasTileLayers) {
      return this.buildMeshFromTileLayers(model, scope, visual);
    }
    return this.buildLegacyMesh(model, scope, connectionType, visual);
  }

  buildAxisLines(model, scope, visual) {
    const group = new THREE.Group();

    if (Array.isArray(model.axisSegments) && model.axisSegments.length > 0) {
      for (const segment of model.axisSegments) {
        if (!segmentInScope(segment, scope)) {
          continue;
        }
        const points = [vector(segment.a), vector(segment.b)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const color = model.axisColors[segment.axis] ?? "#5e5447";
        const material = new THREE.LineBasicMaterial({
          color,
          opacity: 0.38,
          transparent: true,
          linewidth: visual.axisWidth,
        });
        group.add(new THREE.Line(geometry, material));
      }
      return group;
    }

    const { indices } = visibleIndices(scope);
    for (const index of indices) {
      const points = model.layers.map((layer) => vector(layer.points[index])).filter(Boolean);
      if (points.length < 2) {
        continue;
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const first = model.layers[0]?.points?.[index];
      const color = model.axisColors[first?.axis] ?? "#5e5447";
      const material = new THREE.LineBasicMaterial({ color, linewidth: visual.axisWidth });
      group.add(new THREE.Line(geometry, material));
    }

    return group;
  }

  buildProfileLines(model, scope, visual) {
    const group = new THREE.Group();
    if (!visual.showProfiles) {
      return group;
    }

    const layers = model.layers ?? [];
    if (layers.length <= 1) {
      return group;
    }

    const { closed } = getScopeRange(scope);
    const total = Math.max(1, layers.length - 1);

    for (let li = 1; li < layers.length; li += 1) {
      const depth = li / total;
      const points = sortPointsByAngle(layers[li].points.filter((p) => pointInScope(p, scope)));
      if (points.length < 2) {
        continue;
      }

      const linePoints = points.map((p) => vector(p));
      if (closed && points.length > 2) {
        linePoints.push(vector(points[0]));
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const material = new THREE.LineBasicMaterial({
        color: "#2d251d",
        opacity: 0.18 + depth * 0.34,
        transparent: true,
        linewidth: visual.profileWidth,
      });
      group.add(new THREE.Line(geometry, material));
    }

    return group;
  }

  buildPointMarkers(model, scope, visual) {
    if (!visual.showPointMarkers) {
      return new THREE.Group();
    }

    const layers = model.layers ?? [];
    const positions = [];
    const colors = [];
    const total = Math.max(1, layers.length - 1);

    for (let li = 1; li < layers.length; li += 1) {
      const depth = li / total;
      for (const point of layers[li].points) {
        if (!pointInScope(point, scope)) {
          continue;
        }
        const p = vector(point);
        positions.push(p.x, p.y, p.z);
        const base = point.pp ? { r: 28, g: 132, b: 101 } : { r: 45, g: 39, b: 31 };
        const shaded = rgbToUnit(shadeRgb(base, 0.75 + depth * 0.35));
        colors.push(shaded.r, shaded.g, shaded.b);
      }
    }

    if (!positions.length) {
      return new THREE.Group();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.04 * visual.pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
  }

  fitView() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.6 + 1;

    this.camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist);
    this.controls.target.copy(center);
    this.controls.update();
    this.grid.position.y = box.min.y - 0.8;
  }

  setModel(model, scope, connectionType, autoFrame = false, rawVisual = {}) {
    const visual = normalizeVisual(rawVisual);
    this.disposeGroup();

    if (!model) {
      return;
    }

    const connection = connectionType === "divergent" ? "divergent" : "convergent";

    const mesh = this.buildMesh(model, scope, connection, visual);
    this.group.add(mesh);

    const axes = this.buildAxisLines(model, scope, visual);
    this.group.add(axes);

    const profiles = this.buildProfileLines(model, scope, visual);
    this.group.add(profiles);

    const markers = this.buildPointMarkers(model, scope, visual);
    this.group.add(markers);

    const wireframe = new THREE.WireframeGeometry(mesh.geometry);
    const wire = new THREE.LineSegments(
      wireframe,
      new THREE.LineBasicMaterial({
        color: "#2f2a25",
        opacity: clamp(0.08 + visual.tileEdgeWidth * 0.06, 0.08, 0.55),
        transparent: true,
        linewidth: visual.tileEdgeWidth,
      }),
    );
    this.group.add(wire);

    if (autoFrame) {
      this.fitView();
    }
  }

  resetView() {
    this.fitView();
  }

  resize() {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
