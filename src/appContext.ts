/**
 * appContext.ts — Shared state, DOM refs, and callback interfaces.
 * The callback bag pattern breaks circular dependencies between modules.
 */

import { WorkflowManager, type WorkflowDef } from './workflow.js';

// ── DOM element references ───────────────────────────────────────────

export interface DomRefs {
  micBtn: HTMLElement;
  textInput: HTMLInputElement;
  sendBtn: HTMLElement;
  partialEl: HTMLElement;
  intentVal: HTMLElement;
  scoreVal: HTMLElement;
  stateVal: HTMLElement;
  wordVal: HTMLElement;
  messagesEl: HTMLElement;
  bufferDisplay: HTMLElement;
  eventLog: HTMLElement;
  workflowMapEl: HTMLElement;
  modeBadge: HTMLElement;
  nodeEditor: HTMLElement;
  layoutEl: Element;
  codeViewEl: HTMLElement;
}

// ── Callback bag (wired by orchestrator) ─────────────────────────────

export interface ArrowContext {
  intent: string;
  fromStateId?: string;
  target?: string;
  isExitPhrase?: boolean;
}

export interface AppCallbacks {
  openEditor: (nodeId: string) => void;
  openArrowEditor: (ctx: ArrowContext) => void;
  openAddStateEditor: (def: WorkflowDef) => void;
  closeEditor: () => void;
  refreshAll: () => void;
  highlightCodeBlock: (nodeId: string) => void;
  highlightCodeArrow: (fromState: string | undefined, intent: string) => void;
  appendLog: (type: string, text: string) => void;
}

// ── Shared mutable state ─────────────────────────────────────────────

export interface AddStatePreview {
  stateId: string;
  onEnter: string;
  handler?: string;
  maxTurns?: number;
  maxTurnsTarget?: string;
  transitions: Record<string, string>;
  connectFrom: string;
  connectIntent: string;
  intentKeywords: string[];
}

export type PreviewSelection = 'from-node' | 'incoming-arrow' | 'new-state' | 'outgoing';

export interface AppState {
  mgr: WorkflowManager;
  currentDef: WorkflowDef | null;
  visitedStates: Set<string>;
  editingNodeId: string | null;
  lastClassifiedIntent: string;
  lastActiveStateId: string;
  micPausedForTTS: boolean;
  idleLabel: string;
  addStatePreview: AddStatePreview | null;
  previewSelection: PreviewSelection;
  listening: boolean;
  recognition: any;
}

export function createAppState(): AppState {
  return {
    mgr: new WorkflowManager(),
    currentDef: null,
    visitedStates: new Set(),
    editingNodeId: null,
    lastClassifiedIntent: '',
    lastActiveStateId: '',
    micPausedForTTS: false,
    idleLabel: 'IDLE',
    addStatePreview: null,
    previewSelection: 'new-state',
    listening: false,
    recognition: null,
  };
}
