/**
 * WorkflowManager — declarative multi-turn workflow engine.
 *
 * Workflows are defined in JSONL and registered at startup.
 * The manager intercepts user input before the normal conversation pipeline;
 * if a workflow is active, it consumes the input and returns an action.
 */

import { WORKFLOW_HANDLERS, type WorkflowContext, type WorkflowHandler } from './workflowHandlers.js';

// ── Interfaces ──────────────────────────────────────────────────────

export interface WorkflowStateDef {
  id: string;
  onEnter: string;
  transitions: Record<string, string>; // intent → stateId | "exit" | "stateId:message"
  handler?: string;                    // named handler for freeform input
  maxTurns?: number;                   // max inputs before auto-redirect
  maxTurnsTarget?: string;             // where to go (default: "exit")
}

export interface WorkflowDef {
  id: string;
  triggerIntent: string;
  states: Record<string, WorkflowStateDef>;
  initialState: string;
  exitPhrases: string[];
  exitMessage: string;
  ui?: {
    indicatorLabel: string;
    indicatorHint: string;
    bubbleClass: string;
  };
}

export type WorkflowAction =
  | { type: 'enter-state'; stateId: string; message: string; workflowId: string }
  | { type: 'input-captured'; stateId: string; workflowId: string }
  | { type: 'exit-workflow'; message: string; workflowId: string; context: WorkflowContext }
  | { type: 'message'; message: string; workflowId: string };

export interface HandleResult {
  consumed: boolean;
  action?: WorkflowAction;
}

export type WorkflowEventType = WorkflowAction['type'];
export type WorkflowListener = (action: WorkflowAction) => void;

// ── WorkflowManager ─────────────────────────────────────────────────

export class WorkflowManager {
  private registry = new Map<string, WorkflowDef>();
  private handlers = new Map<string, WorkflowHandler>();
  private listeners = new Map<WorkflowEventType, Set<WorkflowListener>>();

  // Active workflow state
  private activeDef: WorkflowDef | null = null;
  private activeStateId: string | null = null;
  private context: WorkflowContext = { buffer: '', metadata: {}, turnCount: 0, stateTurnCount: 0 };

  constructor() {
    // Register built-in handlers
    for (const [name, fn] of Object.entries(WORKFLOW_HANDLERS)) {
      this.handlers.set(name, fn);
    }
  }

  // ── Registration ────────────────────────────────────────────────

  register(def: WorkflowDef): void {
    this.registry.set(def.id, def);
  }

  registerHandler(name: string, fn: WorkflowHandler): void {
    this.handlers.set(name, fn);
  }

  /** Load workflow definitions from JSONL string (one JSON object per line). */
  loadFromJSONL(jsonl: string): void {
    const lines = jsonl.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const def = JSON.parse(line) as WorkflowDef;
      this.register(def);
    }
  }

  // ── Query ───────────────────────────────────────────────────────

  /** Check if an intent would trigger a registered workflow. */
  shouldTrigger(intent: string): boolean {
    for (const def of this.registry.values()) {
      if (def.triggerIntent === intent) return true;
    }
    return false;
  }

  isActive(): boolean {
    return this.activeDef !== null;
  }

  getActiveWorkflowId(): string | null {
    return this.activeDef?.id ?? null;
  }

  getActiveStateId(): string | null {
    return this.activeStateId;
  }

  getContext(): Readonly<WorkflowContext> {
    return this.context;
  }

  /** Returns true if the active state is a pure capture state (has handler, no transitions). */
  isCapturing(): boolean {
    if (!this.activeDef || !this.activeStateId) return false;
    const state = this.activeDef.states[this.activeStateId];
    if (!state) return false;
    return !!state.handler && Object.keys(state.transitions).length === 0;
  }

  // ── Event emitter ───────────────────────────────────────────────

  on(event: WorkflowEventType, listener: WorkflowListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: WorkflowEventType, listener: WorkflowListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(action: WorkflowAction): void {
    const set = this.listeners.get(action.type);
    if (set) {
      for (const fn of set) fn(action);
    }
  }

  // ── Template resolution ─────────────────────────────────────────

  resolveTemplate(template: string, ctx: WorkflowContext): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      if (path === 'buffer') return ctx.buffer;
      if (path === 'turnCount') return String(ctx.turnCount);
      if (path === 'stateTurnCount') return String(ctx.stateTurnCount);
      if (path === 'wordCount') {
        const trimmed = ctx.buffer.trim();
        return trimmed ? String(trimmed.split(/\s+/).length) : '0';
      }
      // metadata.key path
      if (path.startsWith('metadata.')) {
        const key = path.slice('metadata.'.length);
        const val = ctx.metadata[key];
        return val !== undefined ? String(val) : '';
      }
      return '';
    });
  }

  // ── Core input handling ─────────────────────────────────────────

  handleInput(text: string, detectedIntent: string): HandleResult {
    const lower = text.toLowerCase().trim();

    // ── If no workflow active, check for trigger ──
    if (!this.activeDef) {
      const def = this.findByTrigger(detectedIntent);
      if (!def) return { consumed: false };

      // Activate workflow
      this.activeDef = def;
      this.context = { buffer: '', metadata: {}, turnCount: 0, stateTurnCount: 0 };
      return this.enterState(def.initialState);
    }

    // ── Workflow is active ──
    const def = this.activeDef;

    // Check exit phrases first (from any state)
    if (this.matchesExitPhrase(lower, def.exitPhrases)) {
      return this.exitWorkflow();
    }

    const state = def.states[this.activeStateId!];
    if (!state) {
      // Shouldn't happen, but recover gracefully
      return this.exitWorkflow();
    }

    this.context.turnCount++;
    this.context.stateTurnCount++;

    // Check maxTurns retry limit (before resolving transitions)
    if (state.maxTurns && this.context.stateTurnCount > state.maxTurns) {
      const maxTarget = state.maxTurnsTarget ?? 'exit';
      if (maxTarget === 'exit' || maxTarget.startsWith('exit:')) {
        const customMsg = maxTarget.startsWith('exit:') ? maxTarget.slice(5) : undefined;
        return this.exitWorkflow(customMsg);
      }
      // Parse "stateId:overrideMessage" format for maxTurnsTarget too
      const colonIdx = maxTarget.indexOf(':');
      if (colonIdx !== -1) {
        const targetStateId = maxTarget.slice(0, colonIdx);
        const overrideMessage = maxTarget.slice(colonIdx + 1);
        return this.enterState(targetStateId, overrideMessage);
      }
      return this.enterState(maxTarget);
    }

    // Check transitions by intent
    const target = state.transitions[detectedIntent] ?? state.transitions['*'];
    if (target !== undefined) {
      if (target === 'exit' || target.startsWith('exit:')) {
        const customMsg = target.startsWith('exit:') ? target.slice(5) : undefined;
        return this.exitWorkflow(customMsg);
      }
      // Parse "stateId:overrideMessage" format
      const colonIdx = target.indexOf(':');
      if (colonIdx !== -1) {
        const targetStateId = target.slice(0, colonIdx);
        const overrideMessage = target.slice(colonIdx + 1);
        return this.enterState(targetStateId, overrideMessage);
      }
      return this.enterState(target);
    }

    // No transition matched — try handler
    if (state.handler) {
      const handlerFn = this.handlers.get(state.handler);
      if (handlerFn) {
        handlerFn(text, this.context);
        const action: WorkflowAction = {
          type: 'input-captured',
          stateId: state.id,
          workflowId: def.id,
        };
        this.emit(action);
        return { consumed: true, action };
      }
    }

    // No transition, no handler — input is not consumed
    return { consumed: false };
  }

  // ── Internal helpers ────────────────────────────────────────────

  private findByTrigger(intent: string): WorkflowDef | undefined {
    for (const def of this.registry.values()) {
      if (def.triggerIntent === intent) return def;
    }
    return undefined;
  }

  private matchesExitPhrase(lower: string, phrases: string[]): boolean {
    for (const phrase of phrases) {
      if (lower.includes(phrase.toLowerCase())) return true;
    }
    return false;
  }

  private enterState(stateId: string, messageOverride?: string): HandleResult {
    const def = this.activeDef!;
    const state = def.states[stateId];
    if (!state) {
      return this.exitWorkflow();
    }

    // Reset stateTurnCount only when entering a different state (self-loops keep counting)
    if (this.activeStateId !== stateId) {
      this.context.stateTurnCount = 0;
    }
    this.activeStateId = stateId;
    const template = messageOverride ?? state.onEnter;
    const message = this.resolveTemplate(template, this.context);

    const action: WorkflowAction = {
      type: 'enter-state',
      stateId,
      message,
      workflowId: def.id,
    };
    this.emit(action);
    return { consumed: true, action };
  }

  private exitWorkflow(messageOverride?: string): HandleResult {
    const def = this.activeDef!;
    const template = messageOverride ?? def.exitMessage;
    const message = this.resolveTemplate(template, this.context);
    const contextSnapshot = { ...this.context };

    const action: WorkflowAction = {
      type: 'exit-workflow',
      message,
      workflowId: def.id,
      context: contextSnapshot,
    };

    // Clear active state
    this.activeDef = null;
    this.activeStateId = null;
    this.context = { buffer: '', metadata: {}, turnCount: 0, stateTurnCount: 0 };

    this.emit(action);
    return { consumed: true, action };
  }
}
