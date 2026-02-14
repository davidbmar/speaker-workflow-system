# ADR-001: JSONL for Workflow Definitions

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[data-format]` `[engine]` `[config]`

## Context

We need a file format to define workflows (states, transitions, handlers, exit conditions). Options considered:

1. **YAML** — human-readable but requires a parser dependency
2. **JSON array** — one big file, harder to append/merge workflows
3. **JSONL** — one JSON object per line, each line is one workflow
4. **TypeScript DSL** — type-safe but couples definition to code

## Decision

Use **JSONL** (JSON Lines) — one workflow definition per line in `data/workflows.jsonl`.

## Reasoning

- **Zero dependencies** — `JSON.parse()` is built in, no YAML parser needed
- **One workflow per line** — easy to append, grep, diff, and pipe through CLI tools
- **Machine-readable and human-editable** — JSON is universally understood
- **Loadable at runtime** — fetch the file, split by newline, parse each line
- **The visual editor handles readability** — users don't need to edit JSONL directly; the pseudocode view and graph editor make the flow readable

## Consequences

- Workflow definitions are compact but not human-scannable in raw form — mitigated by the linked pseudocode view (ADR-006)
- No schema validation at parse time — the engine trusts the format; the editor enforces structure
- Adding a new workflow = appending a line (no merge conflicts on the same workflow)

## File

`data/workflows.jsonl`
