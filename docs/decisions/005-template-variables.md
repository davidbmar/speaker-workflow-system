# ADR-005: Template Variable System for Messages

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[engine]` `[data-format]`

## Context

Exit messages need dynamic content — e.g., "Transcript locked. 42 words captured." The word count isn't known until runtime. Options:

1. **Hardcoded messages** — no dynamic content
2. **Template variables** — `{{wordCount}}` replaced at runtime
3. **JavaScript template literals** — requires eval
4. **Handler-generated messages** — handler returns the exit message

## Decision

Use **`{{variable}}` template interpolation** in exit messages (and potentially onEnter messages).

## Reasoning

- **Familiar syntax** — `{{mustache}}` style is widely recognized
- **Safe** — string replacement only, no code execution
- **Declarative** — message templates live in the JSONL definition, not in code
- **Visible in the editor** — users see `{{wordCount}}` in the pseudocode view and know it's dynamic

## Available Variables

| Variable | Source | Example Value |
|----------|--------|---------------|
| `{{buffer}}` | `context.buffer` | Full captured text |
| `{{wordCount}}` | Computed from buffer | `42` |
| `{{turnCount}}` | `context.turnCount` | `7` |
| `{{metadata.key}}` | `context.metadata.key` | Any custom value |

## Consequences

- Template resolution happens in `WorkflowManager.resolveTemplate()` at exit time
- Unknown variables are left as-is (no error, no blank) — visible in output for debugging
- The pseudocode view shows templates verbatim (e.g., `exit says: "...{{wordCount}} words..."`)

## Files

- `src/workflow.ts` — `resolveTemplate()` method
