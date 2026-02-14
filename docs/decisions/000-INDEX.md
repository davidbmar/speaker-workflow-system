# Architecture Decision Records — Index

Searchable index of all design decisions. Each ADR documents the **context**, **decision**, and **consequences** of a significant choice.

## How to Use

- **Search by tag** to find related decisions (e.g., `[ui]`, `[engine]`, `[data-format]`)
- **Search by status** — `accepted`, `superseded`, `deprecated`
- **Add new ADRs** as `NNN-short-title.md` with the next sequential number

## ADR Index

| # | Title | Status | Tags | Date |
|---|-------|--------|------|------|
| [001](001-jsonl-workflow-format.md) | JSONL for workflow definitions | accepted | `[data-format]` `[engine]` `[config]` | 2025-02-14 |
| [002](002-declarative-state-machine.md) | Declarative state machine over code-based FSM | accepted | `[engine]` `[architecture]` | 2025-02-14 |
| [003](003-keyword-intent-classification.md) | Keyword-based intent classification | accepted | `[engine]` `[nlp]` | 2025-02-14 |
| [004](004-named-handler-pattern.md) | Named handler pattern for freeform input | accepted | `[engine]` `[extensibility]` | 2025-02-14 |
| [005](005-template-variables.md) | Template variable system for messages | accepted | `[engine]` `[data-format]` | 2025-02-14 |
| [006](006-linked-pseudocode-view.md) | Linked pseudocode view over raw JSON or builder DSL | accepted | `[ui]` `[readability]` | 2025-02-14 |
| [007](007-visual-add-state-editor.md) | Visual graph-based Add State editor over flat form | accepted | `[ui]` `[editor]` | 2025-02-14 |
| [008](008-column-layout-view-toggle.md) | Column layout with view toggling | accepted | `[ui]` `[layout]` | 2025-02-14 |
| [009](009-vanilla-ts-no-framework.md) | Vanilla TypeScript + Vite, no framework | accepted | `[architecture]` `[tooling]` | 2025-02-14 |
| [010](010-bidirectional-graph-code-highlighting.md) | Bidirectional highlighting between graph and code | accepted | `[ui]` `[readability]` | 2025-02-14 |

## Tag Reference

| Tag | Meaning |
|-----|---------|
| `[engine]` | Core workflow runtime / state machine |
| `[ui]` | Visual editor, layout, interaction |
| `[data-format]` | Config file format, serialization |
| `[architecture]` | Overall system structure |
| `[editor]` | Node/arrow/state editing UX |
| `[layout]` | CSS grid, panel arrangement |
| `[readability]` | Making workflows easier to understand |
| `[nlp]` | Intent classification, keyword matching |
| `[extensibility]` | Plugin points, customization |
| `[tooling]` | Build tools, test framework |
| `[config]` | Configuration loading/parsing |
