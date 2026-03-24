# Recursion Rebuild (Step-by-Step)

This reset starts from a minimal recursive triangulation core and verifies behavior in phases.

## Defaults

- Preset: `Haci Kilic`
- Scope: `full`
- Layers default in UI: `3`

## Phase Workflow

1. **Phase 1 (Layer 2 symmetry anchors)**
   - Validate core invariants: no inter-layer crossing, outward monotonic inter-layer edges.
   - Track expected layer-2 local triangles.

2. **Phase 2 (Layer 3 branch fan)**
   - Keep phase-1 invariants.
   - Add layer-3 expected connections.

3. **Phase 3 (Layer 4 recursive repeat)**
   - Keep phase-1 and phase-2 invariants.
   - Add layer-4 expected recursive repeat connections.

`phase` maps directly to engine `triangulationStage`:
- phase 1: primary fan + local wedges
- phase 2: adds diagonal/secondary recursive links
- phase 3: adds seam completion

## Checker

Run the phase checker:

```bash
node scripts/check-recursion.mjs --phase=1 --layers=4 --scope=full
```

Strict connection check mode:

```bash
node scripts/check-recursion.mjs --phase=1 --layers=4 --scope=full --strict-connections
```

Notes:
- Without `--strict-connections`, the checker always enforces geometry invariants and reports missing connection targets as diagnostics.
- With `--strict-connections`, missing connection targets fail the command.
