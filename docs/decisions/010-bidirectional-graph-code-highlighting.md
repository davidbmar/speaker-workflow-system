# ADR-010: Bidirectional Highlighting Between Graph and Code

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[ui]` `[readability]`

## Context

The workflow map (left) shows structure; the pseudocode view (right) shows details. Users need to connect the two — "which code block is this node?" and "which node does this code describe?" Options:

1. **Click code to navigate graph** — one-directional
2. **Hover highlighting** — transient, easy to lose
3. **Click-to-highlight with scroll** — click either side, the other side highlights and scrolls into view

## Decision

Implement **bidirectional click-to-highlight** — clicking a graph node highlights the matching code block (and scrolls to it); clicking a code block opens the editor for that state.

## Implementation

### Data attributes for linking

```html
<!-- Code blocks link to states -->
<div class="code-block" data-code-for="confirm">...</div>

<!-- Transition lines link to specific arrows -->
<div class="code-line" data-code-arrow="confirm:deny">
  on deny → exit "Cancelled."
</div>
```

### Highlight flow

**Graph → Code:**
1. User clicks CONFIRM node on the graph
2. `highlightCodeBlock('confirm')` finds `[data-code-for="confirm"]`
3. Adds `.code-active` class (cyan left border, dark background)
4. Scrolls the code block into view

**Graph arrow → Code line:**
1. User clicks the `deny` arrow from CONFIRM
2. `highlightCodeArrow('confirm', 'deny')` finds `[data-code-arrow="confirm:deny"]`
3. Adds `.code-active` to the line (green left border) and its parent block
4. Scrolls the line into view

**Code → Editor:**
1. User clicks a highlighted code block
2. `onClickBlock(stateId)` calls `openEditor(stateId)`
3. The editor panel replaces the code view

## Reasoning

- **Reduces cognitive load** — users don't have to mentally map between graph and code
- **Smooth scrolling** — `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` keeps context
- **Progressive interaction** — glance at highlight → click to edit → close to return
- **Two granularity levels** — block-level (state) and line-level (transition)

## Consequences

- Every graph node click has two effects: highlight code + open editor
- Every arrow click has two effects: highlight code line + open arrow editor
- Highlighting persists until another element is clicked (not transient like hover)
- The code view must be regenerated after every edit to maintain correct `data-*` attributes

## Files

- `src/demo.ts` — `highlightCodeBlock()`, `highlightCodeArrow()`, wired into `makeNode()` and `makeArrow()`
- `src/codeView.ts` — generates `data-code-for` and `data-code-arrow` attributes
- `index.html` — CSS for `.code-active` on blocks and lines
