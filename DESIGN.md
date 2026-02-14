# Workflow System — Design Document

## Problem Statement

Iris Kade's conversation pipeline currently handles every utterance the same way: classify intent → retrieve → rerank → compose. But some interactions need **multi-turn, stateful flows** — sequences where the system guides the user through steps, remembers context across turns, and exits cleanly back to normal conversation.

**Transcribe mode** is the first example: the user says "transcribe mode", Iris asks for confirmation, then captures all speech into a buffer until the user says "stop transcribe". This pattern (trigger → confirm → capture/interact → exit) is generic enough to power many future workflows: guided setup, quizzes, story co-creation, calibration wizards.

Without a workflow system, each of these would be a one-off FSM bolted onto the pipeline. A declarative, data-driven approach lets us define new flows in JSONL without writing new state machine code.

## Industry Context

This design draws from established patterns in conversational AI:

- **Dialogflow CX** (Google): Page-based flows with state handlers and transition routes
- **Alexa Skills Kit**: Dialog management with slot filling and confirmation
- **Rasa**: Stories and rules for multi-turn conversation management
- **XState**: Generic statecharts for UI and application state

Our approach is simpler than any of these — we don't need slot filling, form validation, or visual editors. We need: states, transitions on intents, named handlers for freeform input, and template variables for exit messages.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Normal Pipeline                     │
│  STT → stateGate → retrieve → rerank → compose      │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│              WorkflowManager                         │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │ Registry │   │ Active Flow  │   │   Context    │ │
│  │ (defs)   │──▶│ (state ptr)  │──▶│ (buffer,    │ │
│  └──────────┘   └──────────────┘   │  metadata,  │ │
│                                     │  turnCount) │ │
│                                     └─────────────┘ │
│                                                      │
│  Events: enter-state, exit-workflow,                 │
│          input-captured, message                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. User speaks → STT produces text
2. Intent classifier detects intent
3. **WorkflowManager.handleInput(text, intent)** is called FIRST
   - If no workflow active and intent matches a trigger → activate workflow, enter initial state
   - If workflow active → check exit phrases, then transitions, then handler
   - Returns `{ consumed: true, action }` if handled, `{ consumed: false }` if not
4. If `consumed === false` → normal pipeline processes the input

### Generic Workflow Lifecycle

```
                    ┌─────────────┐
                    │   IDLE      │
                    │ (no active  │
                    │  workflow)  │
                    └──────┬──────┘
                           │ trigger intent detected
                           ▼
                    ┌─────────────┐
              ┌────▶│   STATE N   │◀────┐
              │     │             │     │
              │     │ • onEnter   │     │
              │     │ • handler?  │     │ transition
              │     │ • transitions│    │ to another
              │     └──────┬──────┘     │ state
              │            │            │
              │     intent matches      │
              │     transition          │
              │            │            │
              │            ├────────────┘
              │            │
              │     transition target = "exit"
              │     OR exit phrase detected
              │            │
              │            ▼
              │     ┌─────────────┐
              │     │    EXIT     │
              └─────│ (resolve    │
                    │  template,  │
                    │  emit event)│
                    └─────────────┘
```

### Transcribe-Specific Flow

```
User: "transcribe mode"
  │
  ▼ intent=transcribe (trigger match)
┌──────────────────────────────┐
│  STATE: confirm               │
│  onEnter: "Transcribe mode.  │
│   Say yes to start, or no    │
│   to cancel."                │
│                               │
│  transitions:                │
│    confirm → recording       │
│    deny    → exit            │
│    *       → exit            │
└──────────┬───────────────────┘
           │ "yes" → intent=confirm
           ▼
┌──────────────────────────────┐
│  STATE: recording             │
│  onEnter: "Recording. Speak  │
│   freely — say stop          │
│   transcribe when done."     │
│                               │
│  handler: accumulate         │
│  transitions: (none)         │
│                               │
│  "hello world" → accumulate  │
│  "more text"   → accumulate  │
└──────────┬───────────────────┘
           │ "stop transcribe" (exit phrase)
           ▼
┌──────────────────────────────┐
│  EXIT                         │
│  "Transcript locked.          │
│   4 words captured."         │
└──────────────────────────────┘
```

## JSONL Format Specification

Each workflow is a single JSON object on one line in a `.jsonl` file:

```typescript
interface WorkflowDef {
  id: string;                    // Unique workflow identifier
  triggerIntent: string;         // Intent that activates this workflow
  initialState: string;          // ID of the first state to enter
  exitPhrases: string[];         // Phrases that exit from ANY state
  exitMessage: string;           // Template string for exit message
  ui?: {                         // Optional UI hints
    indicatorLabel: string;      // e.g. "TRANSCRIBE MODE"
    indicatorHint: string;       // e.g. "say 'stop transcribe' to end"
    bubbleClass: string;         // CSS class for chat bubbles
  };
  states: Record<string, {
    id: string;                  // Must match the key
    onEnter: string;             // Message displayed on state entry
    transitions: Record<string, string>;  // intent → stateId | "exit"
    handler?: string;            // Named handler for unmatched input
  }>;
}
```

## Named Handler API

Handlers are pure functions registered by name:

```typescript
type WorkflowHandler = (text: string, ctx: WorkflowContext) => void;

interface WorkflowContext {
  buffer: string;
  metadata: Record<string, unknown>;
  turnCount: number;
}
```

Built-in handlers:
- **accumulate**: Appends text to buffer (space-separated)
- **bullets**: Appends text as bullet points

Custom handlers can be registered for specific workflow needs.

## Template Variable System

Exit messages (and potentially onEnter messages) support `{{variable}}` interpolation:

| Variable | Source | Example |
|----------|--------|---------|
| `{{buffer}}` | `ctx.buffer` | The full captured text |
| `{{wordCount}}` | Computed from buffer | `42` |
| `{{turnCount}}` | `ctx.turnCount` | `7` |
| `{{metadata.key}}` | `ctx.metadata.key` | Any custom value |

Resolution is done by `WorkflowManager.resolveTemplate()`.

## Integration Plan (Future)

When integrating into Iris Kade:

1. **Pipeline intercept**: In `main.ts`, call `workflowManager.handleInput()` before the normal pipeline. If consumed, skip retrieve/rerank/compose.
2. **UI indicators**: Use `ui.indicatorLabel` / `ui.indicatorHint` to show mode in the DOM.
3. **TTS**: Feed `action.message` directly to TTS (bypassing LLM).
4. **Intent classifier**: The existing `stateGate.ts` already classifies `confirm`, `deny`, `stop` — add `transcribe` intent signals.
5. **Workflow definitions**: Load from `data/workflows.jsonl` at startup.
