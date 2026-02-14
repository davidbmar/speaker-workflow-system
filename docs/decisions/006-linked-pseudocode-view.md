# ADR-006: Linked Pseudocode View Over Raw JSON or Builder DSL

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[ui]` `[readability]`

## Context

The JSONL config is hard to follow because flow logic is buried in nested data structures. Users said "this organization is confusing" and that "the flow chart is easier to understand than the JSON." We explored several options:

1. **Raw JSON display** — show the JSONL directly (rejected: too noisy, hard to trace flow)
2. **TypeScript builder DSL** — fluent API like `workflow('transcribe').state('confirm').on('yes').goto('recording')` (explored but rejected: adds a build step, couples display to a language)
3. **Color-coded pseudocode** — generate readable pseudocode from the WorkflowDef at runtime, linked to the visual graph

## Decision

Generate a **linked pseudocode view** that renders the workflow as readable, color-coded code — and bidirectionally highlights with the workflow map.

## Reasoning

- **Reads like a program** — `state CONFIRM / say "..." / on confirm → goto RECORDING` is immediately understandable
- **No build step** — pseudocode is generated from the same WorkflowDef the engine uses
- **Bidirectional linking** — click a graph node → code highlights; click code → editor opens (ADR-010)
- **Color coding** — keywords (purple), strings (green), intents (orange), state refs (blue) make structure scannable
- **Always in sync** — regenerated after every edit, so code view never goes stale

## Pseudocode Format

```
workflow "transcribe"
    trigger: transcribe
    exit on: "stop transcribe", "stop transcription", ...
    exit says: "Transcript locked. {{wordCount}} words captured."

state CONFIRM
    say "Do you want to transcribe audio?"
    max 3 turns → exit "Sorry, I couldn't understand."
    on confirm → goto RECORDING
    on deny → exit "Cancelled."
    on * → retry "Say yes or no."

state RECORDING
    say "Recording. Speak freely."
    capture: accumulate
```

## Consequences

- Users see the full workflow logic without opening an editor
- The code view is the default right panel (interaction panel accessed via toggle)
- Each code block has `data-code-for` and `data-code-arrow` attributes for highlighting
- The pseudocode is read-only — editing happens through the node/arrow editors

## Alternatives Considered

The TypeScript builder DSL was prototyped conceptually:
```typescript
workflow('transcribe')
  .trigger('transcribe')
  .exitOn('stop transcribe', 'stop transcription')
  .state('confirm', s => s
    .say('Do you want to transcribe?')
    .on('confirm').goto('recording')
    .on('deny').exit('Cancelled.'))
```
This was rejected because: (a) it requires choosing a programming language, (b) it adds a compile/eval step, (c) pseudocode is simpler and language-neutral.

## Files

- `src/codeView.ts` — `renderCodeView()`, pseudocode DOM generation
- `index.html` — CSS for `.code-block`, `.code-keyword`, `.code-string`, etc.
