# 260311_Muqarnas

A browser-based implementation of an octagonal Seljuk muqarnas growth model (Gokmen et al., 2023), currently focused on a simplified Haci Kilic workflow. The model uses fixed silver-ratio units, rule-based axis growth, per-layer triangulated tiling, and collision-aware branching/convergence behavior.

## Features

- 22.5 degree octagonal branch clock with orthogonal/diagonal/secondary axes.
- Fixed silver-ratio unit system from Fig. 5 (`a..g`), scaled with one global ratio scale.
- Rule-syntax controls for axis growth (`a,b,c,d,e,f,g,v`) with Rule I -> Rule II switching by layer.
- Collision-aware growth logic:
  - branching impulses along 22.5 degree multiples,
  - collision consolidation/termination at intersecting growth points,
  - neighbor collision stopping to reduce jagged fanning.
- Layer-by-layer triangulated tile generation (convergent/divergent connection modes).
- Matching colorized tiles in both plan and 3D views.
- Scope modes: quadrant, half dome, full dome.
- Presets streamlined for Haci Kilic-first workflow (`Haci Kilic`, `Custom` initialized from Haci rules).

## Getting Started

1. Open the repository folder.
2. Run a local static server (any one of these):

```bash
python -m http.server 8080
```

```bash
npx serve .
```

3. Open `http://localhost:8080` (or the URL shown by your server).

## Controls

- `Preset`: loads Haci Kilic-first defaults (`Custom` starts from the same baseline).
- `Dome Scope`: `Quadrant (90 degree)`, `Half Dome (180 degree)`, `Full Dome (360 degree)`.
- `Layers`, `Layer Height`, `Initial Radius`: macro form growth.
- `Global Ratio Scale`: scales the fixed silver-ratio growth units.
- Fixed silver-ratio set (`a = 1` baseline):
  - `b = sqrt(2 - sqrt(2))`
  - `c = sqrt(4 - 2*sqrt(2))`
  - `d = sqrt(2) - 1`
  - `e = sqrt(2)`
  - `f = 1 - sqrt(2)/2`
  - `g = sqrt(2)/2`
- `Rule` fields: syntax list per axis (`example: b,c,b,v`).
  - `v` means vertical displacement only (no plan advance).
- `Rule II Starts at Layer`: switches to secondary syntax set at the selected layer.
- `Convergence` controls: governs secondary-axis consolidation behavior.
- `Branching Morphology`: toggles star/polygon emergence on selected axis family.
- `Connection Type`: `convergent` or `divergent` triangular stitching in plan/3D.

## Reference

- Sabri Gokmen, Yusuf Aykin, Altan Basik, Sema Alacam (2023). *A Recursive Algorithm for the Generative Study of Seljuk Muqarnas in Kayseri and Sivas*. Nexus Network Journal, 25, 751-772. DOI: `10.1007/s00004-023-00686-4`.
