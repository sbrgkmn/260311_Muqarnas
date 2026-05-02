# 260311_Muqarnas

Browser-based recursive muqarnas generator aligned with the Seljuk muqarnas paper, using three interacting recursive growth patterns (orthogonal, diagonal, secondary), a 22.5° branching clock, collision-aware convergence, and simplified 2D/3D tile-surface visualization.

## Features

- Four paper case-study presets:
  - Haci Kilic Mosque
  - Sifaiye Madrasah
  - Cifte Minareli Madrasah
  - Gevher Nesibe Madrasah
- Three recursive axis patterns:
  - Orthogonal rule sequence
  - Diagonal rule sequence
  - Secondary rule sequence with periodic convergence behavior
- Layer-specific rule phases for the case studies that switch growth syntax partway through the model.
- 22.5° octagonal branch clock with local angle-based fan branching.
- Fixed silver-ratio unit family with optional global scale (`a,b,c,d,e,f,g,x` where `x=a+d`).
- Collision/convergence checks during layer propagation.
- Convergent/divergent diagonal style for internal quad triangulation.
- Plan + 3D synchronized visualization with minimal triangle/quad face bands, layer profiles, and growth axes.

## Getting Started

1. Open the repository folder.
2. Start a static server from this directory (example):

```bash
python -m http.server 8080
```

3. Open `http://localhost:8080`.

## Controls

- `Case Study`: switches between the four muqarnas structures discussed in the paper.
- `Layers`: recursion depth for the selected case study.
- `Layer Height Scale`: vertical displacement multiplier.
- `Global Ratio Scale`: scales silver-ratio growth units.
- `Tile Diagonal`: `Convergent` or `Divergent` internal diagonal for four-sided display faces.
- Display toggles: tile surfaces, layer profiles, growth axes, point markers, and point labels.
- Plan interaction: mouse wheel zoom, left-drag pan, double-click reset.
- `Recursive rules`: shows the active orthogonal, diagonal, and secondary syntax schedules for the selected case study.

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
