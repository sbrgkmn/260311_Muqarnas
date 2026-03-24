# 260311_Muqarnas

Browser-based recursive muqarnas generator aligned with the article/reference implementation in `article/`, using three interacting recursive growth patterns (orthogonal, diagonal, secondary), a 22.5° branching clock, collision-aware convergence, and layer-wise triangulated topology.

## Features

- Three recursive axis patterns:
  - Orthogonal rule sequence
  - Diagonal rule sequence
  - Secondary rule sequence with periodic convergence behavior
- 22.5° octagonal branch clock with local angle-based fan branching.
- Fixed silver-ratio unit family with optional global scale (`a,b,c,d,x` where `x=a+d`).
- Collision/convergence checks during layer propagation.
- Convergent/divergent triangle connection style switch.
- Single default configuration focused on `Haci Kilic`.
- Plan + 3D synchronized visualization.

## Getting Started

1. Open the repository folder.
2. Start a static server from this directory (example):

```bash
python -m http.server 8080
```

3. Open `http://localhost:8080`.

## Controls

- `Dome Scope`: fixed to `Full Dome (360°)` in the rebuild.
- `Layers`: recursion depth (default `3` for early-layer debugging).
- `Layer Height Scale`: vertical displacement multiplier.
- `Height Pattern`: repeating per-layer height sequence (`example: 1,1,1`).
- `Global Ratio Scale`: scales silver-ratio growth units.
- `Collision Epsilon`: proximity threshold used in convergence/collision checks.
- `Orthogonal Rule`, `Diagonal Rule`, `Secondary Rule`: recursive syntax tokens (`a,b,c,d,x,0,v`; uppercase token can be used as branch marker).
- `Connection Type`: `Convergent` or `Divergent` topology stitching.
- `Axis Line Weight` and `Layer Line Weight`: sliders for axis/profile line thickness (with live value readouts).
- `Show Growth Arrows`: overlays parent-to-child growth directions in plan.
- `Show Growth Values`: labels each growth arrow with the applied token/value (`token:amount`).
- Default visual deployment: `Show Triangles`, `Show Point Labels`, and `Show Growth Values` start off.
- Plan interaction: mouse wheel zoom, left-drag pan, double-click reset.

## Reference

- Sabri Gokmen, Yusuf Aykin, Altan Basik, Sema Alacam (2023). *A Recursive Algorithm for the Generative Study of Seljuk Muqarnas in Kayseri and Sivas*. Nexus Network Journal, 25, 751-772. DOI: `10.1007/s00004-023-00686-4`.
- Implementation draft notes for Haci Kilic-only rewrite: [`docs/HACI_KILIC_RECURSIVE_SPEC.md`](./docs/HACI_KILIC_RECURSIVE_SPEC.md).

## Rebuild Checks

- Step-by-step rebuild guide: [`docs/RECURSION_REBUILD_STEPS.md`](./docs/RECURSION_REBUILD_STEPS.md).
- Phase checker command:

```bash
node scripts/check-recursion.mjs --phase=1 --layers=4 --scope=full
```

- To fail on missing target connections for the selected phase:

```bash
node scripts/check-recursion.mjs --phase=1 --layers=4 --scope=full --strict-connections
```
