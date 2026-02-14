# ADR-007: Visual Graph-Based Add State Editor Over Flat Form

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[ui]` `[editor]`

## Context

Adding a new state to the workflow requires specifying: where it connects from, the intent/keywords for the incoming arrow, the state's messages and handler, and outgoing transitions. The original approach was a flat form with text fields. Users found it hard to understand what they were building.

## Decision

Replace the flat form with a **mini preview graph** that shows exactly how the new state will connect into the workflow.

## Design

The Add State panel shows 4 clickable sections:

```
┌──────────┐
│ FROM NODE │  ← click to select which existing node to connect from
└────┬─────┘
     │
┌────┴─────┐
│ INCOMING │  ← click to configure the intent name + keywords
│  ARROW   │
└────┬─────┘
     │
┌────┴─────┐
│ NEW STATE│  ← click to configure ID, onEnter, handler, maxTurns
└────┬─────┘
     │
┌────┴─────┐
│ OUTGOING │  ← click to add transitions from the new state
└──────────┘
```

Clicking a section highlights it (orange glow) and shows the relevant editor fields below.

## Reasoning

- **Visual context** — users see the graph topology as they build it
- **Progressive disclosure** — only shows fields for the selected section
- **Exit transitions are selectable** — users can connect from an exit arrow (e.g., "connect new state from confirm/deny → EXIT"), not just from state nodes
- **Preview updates in real-time** — changing the state ID updates the preview node label immediately

## Consequences

- More complex code in `demo.ts` (9 functions for the preview system)
- The preview is a simplified version of the main graph renderer
- State selector includes both state nodes and exit transitions as connection targets
- Module-scope variables (`addStatePreview`, `previewSelection`) track preview state

## Files

- `src/demo.ts` — `renderAddStatePanel()`, `renderPreviewGraph()`, `makePreviewNode()`, `makePreviewArrow()`, `renderPreviewFields()`, `refreshPreviewGraph()`, `applyAddState()`
- `index.html` — CSS for `.add-state-preview`, `.preview-selected`, `.state-selector`
