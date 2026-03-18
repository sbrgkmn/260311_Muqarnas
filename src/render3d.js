import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { getScopeRange } from "./engine.js";
import { rgbToUnit, shadeRgb, tileTriangleColors, triangleColor } from "./tileColors.js";

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
  const centerX = (tile.a.x + tile.b.x + tile.c.x) / 3;
  const centerY = (tile.a.y + tile.b.y + tile.c.y) / 3;
  const angle = normalizeAngle(Math.atan2(centerY, centerX));
  return angle <= scopeMaxAngle(scope) + 1e-6;
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

  buildMeshFromTileLayers(model, scope) {
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

        const base = triangleColor(model.axisColors, tile.a, tile.b, tile.c);
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
    });

    return new THREE.Mesh(geometry, material);
  }

  buildLegacyMesh(model, scope, connectionType) {
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
    });

    return new THREE.Mesh(geometry, material);
  }

  buildMesh(model, scope, connectionType) {
    const hasTileLayers = Array.isArray(model.tileLayers) && model.tileLayers.some((layer) => layer.triangles?.length > 0);
    if (hasTileLayers) {
      return this.buildMeshFromTileLayers(model, scope);
    }
    return this.buildLegacyMesh(model, scope, connectionType);
  }

  buildAxisLines(model, scope) {
    const { indices } = visibleIndices(scope);
    const group = new THREE.Group();

    for (const index of indices) {
      const points = model.layers.map((layer) => vector(layer.points[index]));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const color = model.axisColors[model.layers[0].points[index].axis];
      const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });
      group.add(new THREE.Line(geometry, material));
    }

    return group;
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

  setModel(model, scope, connectionType, autoFrame = false) {
    this.disposeGroup();

    if (!model) {
      return;
    }

    const connection = connectionType === "divergent" ? "divergent" : "convergent";

    const mesh = this.buildMesh(model, scope, connection);
    this.group.add(mesh);

    const axes = this.buildAxisLines(model, scope);
    this.group.add(axes);

    const wireframe = new THREE.WireframeGeometry(mesh.geometry);
    const wire = new THREE.LineSegments(
      wireframe,
      new THREE.LineBasicMaterial({ color: "#2f2a25", opacity: 0.15, transparent: true }),
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
