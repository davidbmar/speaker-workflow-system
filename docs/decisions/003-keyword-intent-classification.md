# ADR-003: Keyword-Based Intent Classification

**Status:** accepted
**Date:** 2025-02-14
**Tags:** `[engine]` `[nlp]`

## Context

The workflow engine transitions on **intents** (e.g., `confirm`, `deny`, `transcribe`). We need to classify user input into intents. Options:

1. **Embedder-based** — use MiniLM-L6-v2 embeddings + exemplar matching (like Iris Kade's main pipeline)
2. **Keyword matching** — define keyword lists per intent, match against input
3. **LLM classification** — send input to an LLM with a classification prompt
4. **Regex rules** — pattern matching

## Decision

Use **keyword-based classification** with per-intent keyword lists stored in the JSONL definition.

## Reasoning

- **Zero latency** — keyword matching is <1ms, no model loading needed
- **Self-contained** — no dependency on embedder, LLM, or external service
- **Editable in the visual editor** — users can see and modify keyword lists directly
- **Sufficient for workflows** — workflow intents are typically simple (yes/no/stop), not open-ended queries
- **Transparent** — users can see exactly which keywords trigger which transitions

## Trade-offs

- Less flexible than embedder — "sure thing" won't match `confirm` unless explicitly listed
- Keyword lists need manual curation — but the editor makes this easy
- For the parent Iris Kade project, the embedder-based classifier (52 intents, 95.8% accuracy) is more appropriate for open conversation; keyword matching is right for constrained workflow steps

## Consequences

- Each transition arrow in the editor shows its keyword list
- Adding a new intent = adding keywords to the JSONL definition
- The classifier is a single function with no model dependencies

## Files

- `src/intentClassifier.ts` — keyword matching logic
- `data/workflows.jsonl` — keyword lists per intent (in transition metadata)
