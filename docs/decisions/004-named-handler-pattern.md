# ADR-004: Named Handler Pattern for Freeform Input

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[engine]` `[extensibility]`

## Context

Some workflow states need to process **every utterance** without transitioning — e.g., the RECORDING state captures all speech into a buffer. Options:

1. **Inline functions in the definition** — not possible in JSONL
2. **Named handlers** — reference a handler by string name, register implementations in code
3. **Eval/script blocks** — embed JavaScript in the definition (security risk)

## Decision

Use **named handlers** — a state can specify `"handler": "accumulate"`, and the engine looks up a registered function by that name.

## Reasoning

- **Separation of concerns** — definitions describe *what* handler to use, code implements *how*
- **Safe** — no eval, no script injection; only pre-registered handlers execute
- **Extensible** — new handlers are registered with `registerHandler(name, fn)` without changing the engine
- **Testable** — handlers are pure functions that take `(text, context)` and mutate context

## Built-in Handlers

| Name | Behavior |
|------|----------|
| `accumulate` | Appends text to `context.buffer` (space-separated) |
| `bullets` | Appends text as `\n- item` to `context.buffer` |

## Consequences

- Custom workflows can register domain-specific handlers (e.g., `quiz-answer`, `slot-fill`)
- Handlers have access to the full `WorkflowContext` (buffer, metadata, turnCount)
- A state with a handler processes input that doesn't match any transition — handler is the fallback

## Files

- `src/workflowHandlers.ts` — handler registry and built-in handlers
- `src/workflow.ts` — engine calls handler when no transition matches
