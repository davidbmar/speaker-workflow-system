# ADR-011: Graph-aware Workflow Map with Link Nodes and Tree Connectors

**Status:** accepted
**Date:** 2026-02-14
**Tags:** `[ui]` `[layout]` `[readability]`

## Context

The workflow map renders state transitions as a tree. When multiple transitions target the same state (e.g. both CONFIRM and DOUBLE_CHECK transition to RECORDING), the target state's entire subtree is duplicated. This makes the map confusing — it looks like there are two separate RECORDING states.

Additionally, when states have multiple outgoing transitions, the branch arms spread apart at wider panel widths with no visible connector lines between the parent node and its children.

## Decision

Three changes to make the workflow map graph-aware:

1. **Link targets** — Track rendered states in a `Set<string>`. When a state is already rendered, show a lightweight `↗ STATE_NAME` label instead of duplicating the subtree. An SVG dotted connector line arcs from the label to the real node. Clicking the label scrolls to and flashes the real node.

2. **Sub-branching** — When any state (not just the initial state) has multiple non-wildcard transitions, render them as a `.wf-branch` with separate arms. Previously only the initial state branched; intermediate states rendered all transitions linearly.

3. **Tree connector lines** — Add horizontal bars and vertical stubs connecting parent nodes to their branch arms. Uses a CSS custom property `--arm-count` to calculate the horizontal bar width: `left/right: calc(50% / var(--arm-count))`.

4. **Unique exit node IDs** — Exit nodes use specific IDs (`exit-recording`, `exit-double_check-deny`) instead of generic `exit`. The `findExitNodeId` function resolves the most specific match: composite `exit-{state}-{intent}` > by-intent > by-state > fallback.

## Implementation

### Rendered-state tracking (`workflowMap.ts`)

```
renderWorkflowMap() creates rendered = new Set<string>()
  → passes to renderStateChain()
  → before rendering a state, checks rendered.has(stateId)
  → if already rendered: appends makeLinkTarget(stateId) instead
```

### SVG connector (`workflowMap.ts`)

```
drawLinkConnectors(container)
  → finds all .link-target elements
  → for each, finds the real .wf-node[data-node="stateId"]
  → draws a cubic bezier SVG path between them
  → ResizeObserver redraws on panel/container resize
```

### Tree connectors (`styles/main.css`)

```
.branch-vline     — vertical stub from parent to horizontal bar
.wf-branch::before — horizontal bar (width calculated from --arm-count)
.wf-branch-arm::before — vertical stub from bar down to each arm
```

## Consequences

- **No subtree duplication** — each state renders once; duplicates become link targets
- **Automatic highlighting** — `stateHighlight.ts` uses `querySelectorAll` so it still works (link targets don't need `data-node` since they're not `.wf-node` elements)
- **Resize-safe** — `ResizeObserver` redraws SVG connectors when the panel width changes
- **Scales to any workflow** — the `rendered` set and branching logic are generic, not workflow-specific
- **No test changes needed** — all 72 tests are pure engine logic with no DOM rendering

## Files

- `src/workflowMap.ts` — rendered set, `makeLinkTarget()`, `drawLinkConnectors()`, `observeResize()`, sub-branching
- `src/stateHighlight.ts` — `findExitNodeId()` updated for composite exit node IDs
- `styles/main.css` — `.link-target`, `.branch-vline`, `.wf-branch::before`, `.wf-branch-arm::before`, `.flash` animation, `.link-connectors` SVG overlay
