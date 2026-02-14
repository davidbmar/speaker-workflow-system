# ADR-008: Column Layout with View Toggling

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[ui]` `[layout]`

## Context

The UI needs to show: (1) workflow map, (2) code view, (3) node/arrow editors, (4) interaction panel for testing. Showing all at once is too cramped. Options:

1. **3-column layout** — map | code | interaction (too wide, wastes space when not interacting)
2. **Tabs** — switch between views in a single panel (loses context)
3. **2-column with toggles** — map always visible, right column switches between views

## Decision

Use a **2-column CSS grid layout** where column 2 switches between three views:

- **Code view** (default) — pseudocode with highlighting
- **Editor** — opens when clicking a node/arrow, replaces code view
- **Interaction panel** — toggled via INTERACT button, for testing the workflow

## Implementation

```css
.layout { grid-template-columns: 340px 1fr; }

/* Default: code view visible */
#code-view { grid-column: 2; }

/* Editor replaces code view */
.layout.editor-open #code-view { display: none; }
#node-editor.open { display: flex; }

/* Interaction replaces code view */
.layout.interaction-mode #code-view { display: none; }
.layout.interaction-mode .interaction-panel { display: flex; }
```

## Reasoning

- **Map is always visible** — the graph is the primary navigation tool
- **Code view is the default** — users see the full workflow at a glance
- **Editor is contextual** — only appears when actively editing a node
- **Interaction is opt-in** — toggle when you want to test, otherwise see the code
- **No information overload** — only two panels visible at any time

## Consequences

- Three CSS class toggles on `.layout`: `editor-open`, `interaction-mode` (plus `#node-editor.open`)
- The INTERACT/CODE button in the header switches modes
- Closing the editor returns to code view (not interaction)
- The workflow map column is fixed at 340px; the right column flexes

## Files

- `index.html` — CSS grid rules, class toggle styles
- `src/demo.ts` — `layoutEl.classList.add/remove('editor-open')`, view toggle wiring
