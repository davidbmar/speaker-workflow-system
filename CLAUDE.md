# CLAUDE.md

## Project Overview

Speaker Workflow System — a visual editor and runtime for declarative multi-turn conversational workflows. Vanilla TypeScript + Vite, no framework. Zero dependencies at runtime.

## Commands

```bash
npm run dev          # Dev server (Vite, usually localhost:5174)
npm run test         # Run all 72 tests (Vitest)
npm run test:watch   # Watch mode
```

Type checking (no build script configured):
```bash
npx tsc --noEmit
```

## Architecture

### Engine (`src/workflow.ts`)

The `WorkflowManager` class runs a state machine defined by `WorkflowDef` (loaded from JSONL).

```
handleInput(text, intent)
  → check exit phrases (global exit from any state)
  → check transitions (intent → target state or exit)
  → check handler (freeform input capture)
  → return { consumed, action }
```

Key types: `WorkflowDef`, `WorkflowStateDef`, `WorkflowAction`, `WorkflowContext`.

### UI (`src/demo.ts`)

Single-file UI with:
- **Workflow map** — DOM-based graph with `makeNode()` and `makeArrow()`
- **Node editor** — opens in column 2 when clicking a node/arrow
- **Code view** — pseudocode panel (column 2, default view)
- **Interaction panel** — test the workflow (toggle via INTERACT button)
- **Add State editor** — mini preview graph for adding new states

Layout uses CSS grid with class toggles: `.editor-open`, `.interaction-mode`.

### Code View (`src/codeView.ts`)

Generates color-coded pseudocode DOM from `WorkflowDef`. Each `.code-block` has `data-code-for="stateId"` and transition lines have `data-code-arrow="stateId:intent"` for bidirectional highlighting with the workflow map.

### Other Files

- `workflowHandlers.ts` — Named handlers (`accumulate`, `bullets`)
- `intentClassifier.ts` — Keyword-based intent classification
- `editorUtils.ts` — Parse/serialize helpers (transitions, exit phrases, keywords)
- `data/workflows.jsonl` — Workflow definitions
- `index.html` — Entry point with all CSS inline

## Testing

72 tests across 3 files:
- `tests/workflow.test.ts` — Engine unit tests
- `tests/transcribe.test.ts` — Transcribe workflow integration tests
- `tests/editor.test.ts` — Editor parse/serialize tests

All tests are pure logic (no DOM). Run with `npm run test`.

## Key Patterns

- **Transition targets** use the format: `stateId`, `exit`, `exit:message`, or `stateId:message` (retry with message)
- **`*` wildcard transition** — catches any unmatched intent
- **`maxTurns` + `maxTurnsTarget`** — auto-exit or auto-transition after N turns in a state
- **Template variables** — `{{wordCount}}`, `{{buffer}}`, `{{turnCount}}` resolved at exit time
- **State renaming** — `renameState()` in demo.ts re-wires all transitions, initialState, and maxTurnsTarget

## Decision Records

Architecture decisions are documented in `docs/decisions/`. See [000-INDEX.md](docs/decisions/000-INDEX.md) for a searchable index with tags.

Before making significant design changes, check existing ADRs for context. After making a decision, add a new ADR:
1. Copy an existing ADR as a template
2. Use the next sequential number (e.g., `011-your-decision.md`)
3. Update `000-INDEX.md` with the new entry
4. Tag appropriately: `[engine]`, `[ui]`, `[data-format]`, `[architecture]`, `[editor]`, `[layout]`, `[readability]`, `[nlp]`, `[extensibility]`, `[tooling]`, `[config]`
