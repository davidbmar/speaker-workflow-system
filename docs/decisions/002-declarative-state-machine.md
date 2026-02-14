# ADR-002: Declarative State Machine Over Code-Based FSM

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[engine]` `[architecture]`

## Context

Multi-turn conversations (like transcribe mode) need stateful flow control. Options:

1. **Hand-coded FSM** — a custom class per workflow with hardcoded transitions
2. **XState** — full statecharts library with visual tools
3. **Declarative data-driven FSM** — define states/transitions in data, one generic engine executes them

## Decision

Build a **generic declarative engine** (`WorkflowManager`) that runs any workflow defined as a `WorkflowDef` data structure.

## Reasoning

- **New workflows without new code** — add a JSONL line, not a TypeScript class
- **Testable** — the engine is a single pure-ish class; feed it a definition and assert on outputs
- **Visual editor possible** — because workflows are data, the editor can read, modify, and write them back
- **XState is overkill** — we don't need parallel states, history nodes, or guards; our flows are simple linear/branching paths
- **Patterns from industry** — Dialogflow CX (pages + routes), Alexa (dialog management), Rasa (stories) all use declarative definitions

## Consequences

- Every workflow shares the same execution model (states, transitions, handlers, exit phrases)
- Complex conditional logic inside a state isn't supported — only intent-based transitions
- The engine is ~200 lines; adding features (guards, parallel states) would require engine changes
- 72 tests validate the engine behavior

## Files

- `src/workflow.ts` — `WorkflowManager`, `WorkflowDef`, `WorkflowStateDef`
- `tests/workflow.test.ts` — engine unit tests
