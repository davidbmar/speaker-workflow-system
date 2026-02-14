# ADR-009: Vanilla TypeScript + Vite, No Framework

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[architecture]` `[tooling]`

## Context

The visual editor needs to render a workflow graph, code view, editors, and interaction panel. Options:

1. **React/Vue/Svelte** — component-based UI framework
2. **Web Components** — browser-native components
3. **Vanilla TypeScript** — direct DOM manipulation with Vite for dev/build

## Decision

Use **vanilla TypeScript + Vite** with no UI framework.

## Reasoning

- **Consistency with Iris Kade** — the parent project is also vanilla TS + Vite
- **Zero runtime dependencies** — the `package.json` has only devDependencies (typescript, vite, vitest)
- **Small codebase** — the UI is ~1 file (`demo.ts`) with direct DOM manipulation; a framework would add abstraction without reducing complexity
- **Fast iteration** — no component lifecycle, no state management library, no JSX compilation
- **Portable** — can be embedded in any project without framework compatibility concerns

## Trade-offs

- No reactive state management — UI updates are manual (`renderWorkflowMap()`, `refreshCodeView()`)
- No component reuse — graph nodes, editors, and panels are rendered by functions, not components
- innerHTML is used for some rendering — sanitized via `escHtml()` helper

## Consequences

- All UI code lives in `demo.ts` (~700 lines) and `codeView.ts` (~170 lines)
- State is managed via module-scope variables (`currentDef`, `addStatePreview`, etc.)
- CSS is inline in `index.html` (no CSS modules or preprocessor)
- Vitest is used for testing (compatible with Vite, zero-config)

## Files

- `package.json` — devDependencies only: typescript, vite, vitest
- `vite.config.ts` — minimal Vite config
