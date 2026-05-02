import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { getScopeRange } from "./engine.js?v=20260501b";
import { rgbToUnit, shadeRgb } from "./tileColors.js?v=20260501b";

const DEFAULT_VISUAL = {
  profileWidth: 2.2,
  axisWidth: 1,
  pointSize: 2.4,
  showTiles: true,
  showProfiles: true,
  showPointMarkers: true,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVisual(rawVisual) {
  const source = rawVisual ?? {};
  return {
    profileWidth: clamp(Number(source.profileWidth) || DEFAULT_VISUAL.profileWidth, 0.2, 8),
    axisWidth: clamp(Number(source.axisWidth) || DEFAULT_VISUAL.axisWidth, 0.2, 6),
    pointSize: clamp(Number(source.pointSize) || DEFAULT_VISUAL.pointSize, 0.4, 10),
    showTiles: source.showTiles !== false,
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

function faceInScope(face, scope) {
  return (face.vertices ?? []).some((point) => pointInScope(point, scope));
}

function tileColorForLayer(layer, total) {
  const t = total <= 1 ? 0 : layer / total;
  const warm = { r: 212, g: 177, b: 132 };
  const cool = { r: 116, g: 154, b: 158 };
  return new THREE.Color(
    (warm.r + (cool.r - warm.r) * t) / 255,
    (warm.g + (cool.g - warm.g) * t) / 255,
    (warm.b + (cool.b - warm.b) * t) / 255,
  );
}

function faceVertices(face) {
  return face.vertices ?? [face.a, face.b, face.c].filter(Boolean);
}

function triangleVertexSets(vertices, connectionType) {
  if (vertices.length === 3) {
    return [[vertices[0], vertices[1], vertices[2]]];
  }
  if (vertices.length !== 4) {
    return [];
  }
  if (connectionType === "divergent") {
    return [
      [vertices[0], vertices[1], vertices[2]],
      [vertices[0], vertices[2], vertices[3]],
    ];
  }
  return [
    [vertices[0], vertices[1], vertices[3]],
    [vertices[1], vertices[2], vertices[3]],
  ];
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    root.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, -2, 0);

    const ambient = new THREE.HemisphereLight("#fff8e8", "#52615f", 0.72);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffffff", 1.15);
    key.position.set(8, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 80;
    key.shadow.camera.left = -24;
    key.shadow.camera.right = 24;
    key.shadow.camera.top = 24;
    key.shadow.camera.bottom = -24;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight("#dcefed", 0.35);
    fill.position.set(-7, 6, -5);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight("#fff5df", 0.28);
    rim.position.set(-5, 8, 7);
    this.scene.add(rim);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const shadowGeometry = new THREE.PlaneGeometry(80, 80);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.ShadowMaterial({
      color: "#2f2a25",
      opacity: 0.16,
      transparent: true,
    });
    this.shadowPlane = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.position.y = -8.02;
    this.scene.add(this.shadowPlane);

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
      child.traverse((item) => {
        if (item.geometry) {
          item.geometry.dispose();
        }
        if (item.material) {
          if (Array.isArray(item.material)) {
            item.material.forEach((material) => material.dispose());
          } else {
            item.material.dispose();
          }
        }
      });
    }
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
        const displayAxis = segmentDisplayAxis(segment);
        const color = model.axisColors[displayAxis] ?? "#5e5447";
        const material = new THREE.LineBasicMaterial({
          color,
          opacity: 0.85,
          transparent: true,
          depthTest: false,
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

  buildTileSurfaces(model, scope, visual) {
    const group = new THREE.Group();
    const tileLayers = model.displayTileLayers ?? model.tileLayers;
    if (!visual.showTiles || !Array.isArray(tileLayers)) {
      return group;
    }

    const total = Math.max(1, tileLayers.length - 1);
    for (const tileLayer of tileLayers) {
      const faces = tileLayer.faces ?? tileLayer.triangles ?? [];
      if (!faces.length) {
        continue;
      }

      const positions = [];
      const edgePositions = [];
      const connectionType = tileLayer.connectionType ?? model.params?.connectionType ?? "convergent";
      for (const face of faces) {
        const vertices = faceVertices(face);
        if (vertices.length < 3 || !faceInScope({ vertices }, scope)) {
          continue;
        }

        for (const triangle of triangleVertexSets(vertices, connectionType)) {
          for (const point of triangle) {
            const p = vector(point);
            positions.push(p.x, p.y, p.z);
          }
        }

        for (let i = 0; i < vertices.length; i += 1) {
          const a = vector(vertices[i]);
          const b = vector(vertices[(i + 1) % vertices.length]);
          edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }

      if (!positions.length) {
        continue;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: tileColorForLayer(tileLayer.layer ?? 0, total),
        roughness: 0.72,
        metalness: 0.02,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: true,
        flatShading: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: "#263330",
        transparent: true,
        opacity: 0.28,
        depthTest: true,
      });
      group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
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
        opacity: 0.45 + depth * 0.35,
        transparent: true,
        depthTest: false,
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
    const floorY = box.min.y - 0.8;
    this.grid.position.y = floorY + 0.01;
    this.shadowPlane.position.y = floorY;
  }

  setModel(model, scope, autoFrame = false, rawVisual = {}) {
    const visual = normalizeVisual(rawVisual);
    this.disposeGroup();

    if (!model) {
      return;
    }

    const tiles = this.buildTileSurfaces(model, scope, visual);
    this.group.add(tiles);

    const axes = this.buildAxisLines(model, scope, visual);
    this.group.add(axes);

    const profiles = this.buildProfileLines(model, scope, visual);
    this.group.add(profiles);

    const markers = this.buildPointMarkers(model, scope, visual);
    this.group.add(markers);

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
