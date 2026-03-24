# Haci Kilic Recursive Rule Spec (Draft)

This document narrows the new implementation to a single target: **Haci Kilic**.
It is based on the paper `10.1007/s00004-023-00686-4` and Fig. 7.

## Scope

- Only Haci Kilic parameters are supported.
- Default scope is `quadrant`.
- Only one growth model is implemented (no preset switching).

## Axis System

Three interacting growth axes are tracked per layer:

- `orthogonal` (red)
- `diagonal` (blue)
- `secondary` (green)

The branching clock is octagonal with 22.5 degree increments.

## Core Rhythms (From Paper)

- Growth repeats in a **2-layer rhythm** for Haci Kilic.
- Diagonal axis produces star/polygon alternation through repeated branching.
- Secondary axis supports local conversion between odd-layer stars and even-layer polygons.

## Rule Sequences (Haci Kilic)

Paper text indicates:

- Base phase:
  - Orthogonal: `b -> c -> b -> v`
  - Diagonal: `b -> c`
  - Secondary: `a -> a -> d`
- After layer 6:
  - Orthogonal switches to: `c -> b -> b -> v`
  - Diagonal switches to: `c -> b`
  - Secondary remains coordinated with the same 2-layer rhythm.

`v` means vertical displacement without plan advance.

## Geometric Invariants For New Engine

These are non-negotiable constraints for every generated layer:

- Outward propagation: every inter-layer edge must satisfy `r(layer+1) >= r(layer)` within epsilon.
- Local adjacency: each new node only connects to adjacent parent neighborhood in angular order.
- No planar crossings in inter-layer diagonals.
- Quadrant diagonal symmetry (`y = x`) must hold after stitching.
- Layer-to-layer triangulation is local (no long-range jumps).

## Connectivity Intent (As Requested)

Within the quadrant-local indexing convention:

- Layer 2 should realize symmetric neighbor fan from the prior-layer middle branch:
  - `1:2 -> 2:1` and `1:2 -> 2:3` (with its center continuation)
- Layer 3 branching should create radial fan behavior:
  - `3:2 ... 3:8 -> 2:2`
- This local fan recursion repeats in later layers.

## Proposed New Implementation Order

1. Rebuild layer growth state from axis-tagged frontier points only.
2. Apply token advancement per axis sequence (phase-aware rule switch at layer 7).
3. Branch using fixed 22.5 degree clock and axis assignment.
4. Resolve convergence/collision before meshing.
5. Stitch triangles only via local parent fan + adjacent parent pairs.
6. Enforce invariants (outward, no-cross, symmetry) as hard filters.

## Notes On Certainty

- Rule sequences above are taken directly from extracted paper text sections discussing Haci Kilic.
- The exact table-level per-layer indexing in Table 2 is partially image-based in the PDF; the connectivity bullets above are currently interpreted from your diagram intent and should be treated as implementation targets.
