/**
 * demo.ts — Orchestrator that wires all modules together.
 * Loads the workflow, sets up event listeners, and connects the callback bag.
 */

import type { WorkflowAction, WorkflowDef } from './workflow.js';
import { createAppState, type DomRefs, type AppCallbacks } from './appContext.js';
import { classifyIntent } from './intentClassifier.js';
import { renderWorkflowMap } from './workflowMap.js';
import { openEditor } from './nodeEditor.js';
import { openArrowEditor } from './arrowEditor.js';
import { openAddStateEditor } from './addStateEditor.js';
import { refreshCodeView, highlightCodeBlock, highlightCodeArrow } from './codeHighlight.js';
import { highlightState, highlightExit, findExitNodeId } from './stateHighlight.js';
import { speak, showSpeechBubble, clearSpeechBubbles } from './speechOutput.js';
import { addMessage, updateBuffer, appendLog } from './interaction.js';
import { initSpeechRecognition } from './speechRecognition.js';

// ── DOM refs ────────────────────────────────────────────────────────

const dom: DomRefs = {
  micBtn: document.getElementById('mic-btn')!,
  textInput: document.getElementById('text-input') as HTMLInputElement,
  sendBtn: document.getElementById('send-btn')!,
  partialEl: document.getElementById('partial')!,
  intentVal: document.getElementById('intent-val')!,
  scoreVal: document.getElementById('score-val')!,
  stateVal: document.getElementById('state-val')!,
  wordVal: document.getElementById('word-val')!,
  messagesEl: document.getElementById('messages')!,
  bufferDisplay: document.getElementById('buffer-display')!,
  eventLog: document.getElementById('event-log')!,
  workflowMapEl: document.getElementById('workflow-map')!,
  modeBadge: document.getElementById('mode-badge')!,
  nodeEditor: document.getElementById('node-editor')!,
  layoutEl: document.querySelector('.layout')!,
  codeViewEl: document.getElementById('code-view')!,
};

// ── Shared state ────────────────────────────────────────────────────

const state = createAppState();

// ── Callback bag (breaks circular deps) ─────────────────────────────

function closeEditor(): void {
  dom.nodeEditor.classList.remove('open');
  dom.layoutEl.classList.remove('editor-open');
  dom.nodeEditor.textContent = '';
  document.querySelectorAll('.wf-node.editing').forEach(n => n.classList.remove('editing'));
  document.querySelectorAll('.wf-arrow.editing').forEach(n => n.classList.remove('editing'));
  state.editingNodeId = null;
}

function refreshAll(): void {
  if (!state.currentDef) return;
  renderWorkflowMap(state.currentDef, state, dom.workflowMapEl, cb);
  refreshCodeView(state, dom, cb);
  highlightState(state.mgr.getActiveStateId(), state, dom);
}

const cb: AppCallbacks = {
  openEditor: (nodeId) => openEditor(nodeId, state, dom, cb),
  openArrowEditor: (ctx) => openArrowEditor(ctx, state, dom, cb),
  openAddStateEditor: (def) => openAddStateEditor(def, state, dom, cb),
  closeEditor,
  refreshAll,
  highlightCodeBlock,
  highlightCodeArrow,
  appendLog: (type, text) => appendLog(type, text, dom),
};

// ── Event handling ──────────────────────────────────────────────────

function onAction(action: WorkflowAction): void {
  switch (action.type) {
    case 'enter-state':
      highlightState(action.stateId, state, dom);
      highlightCodeBlock(action.stateId);
      dom.stateVal.textContent = action.stateId;
      dom.stateVal.classList.add('highlight');
      addMessage(action.message, 'system', dom);
      appendLog('enter-state', `\u2192 ${action.stateId}: ${action.message}`, dom);
      speak(action.message, state);
      showSpeechBubble(action.stateId, action.message);
      break;
    case 'input-captured':
      appendLog('input-captured', `buffer updated (${action.stateId})`, dom);
      updateBuffer(state.mgr.getContext(), dom);
      break;
    case 'exit-workflow': {
      const exitNodeId = findExitNodeId(state);
      highlightExit(state, dom);
      dom.stateVal.textContent = 'idle';
      dom.stateVal.classList.remove('highlight');
      dom.modeBadge.textContent = 'IDLE';
      dom.modeBadge.classList.remove('active');
      addMessage(action.message, 'system', dom);
      appendLog('exit-workflow', action.message, dom);
      speak(action.message, state);
      showSpeechBubble(exitNodeId, action.message);
      setTimeout(() => {
        dom.bufferDisplay.textContent = '';
        dom.wordVal.textContent = '0';
        clearSpeechBubbles();
      }, 3000);
      break;
    }
    case 'message':
      addMessage(action.message, 'system', dom);
      appendLog('message', action.message, dom);
      speak(action.message, state);
      break;
  }
}

// ── Input processing ────────────────────────────────────────────────

function processInput(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(trimmed, 'user', dom);
  state.lastActiveStateId = state.mgr.getActiveStateId() ?? '';

  if (state.mgr.isActive()) {
    if (state.mgr.isCapturing()) {
      dom.intentVal.textContent = '-';
      dom.scoreVal.textContent = '-';
      state.lastClassifiedIntent = 'unknown';
      appendLog('input-captured', `"${trimmed}" (classifier bypassed)`, dom);
      state.mgr.handleInput(trimmed, 'unknown');
      updateBuffer(state.mgr.getContext(), dom);
      return;
    }
    const { intent, score } = classifyIntent(trimmed);
    dom.intentVal.textContent = intent;
    dom.scoreVal.textContent = String(score);
    state.lastClassifiedIntent = intent;
    appendLog('intent', `"${trimmed}" \u2192 ${intent} (score: ${score})`, dom);
    state.mgr.handleInput(trimmed, intent);
    if (state.mgr.isActive()) updateBuffer(state.mgr.getContext(), dom);
    return;
  }

  const { intent, score } = classifyIntent(trimmed);
  dom.intentVal.textContent = intent;
  dom.scoreVal.textContent = String(score);
  state.lastClassifiedIntent = intent;
  appendLog('intent', `"${trimmed}" \u2192 ${intent} (score: ${score})`, dom);

  const result = state.mgr.handleInput(trimmed, intent);
  if (!result.consumed) {
    appendLog('intent', 'Not consumed \u2014 would fall through to normal pipeline.', dom);
  }
  if (state.mgr.isActive()) updateBuffer(state.mgr.getContext(), dom);
}

// ── Panel toggles ───────────────────────────────────────────────────

document.querySelectorAll('.panel-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = (btn as HTMLElement).dataset.panel;
    if (!panel) return;
    dom.layoutEl.classList.toggle(`${panel}-closed`);
    btn.classList.toggle('active');
  });
});

document.querySelectorAll('.panel-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = (btn as HTMLElement).dataset.panel;
    if (!panel) return;
    dom.layoutEl.classList.add(`${panel}-closed`);
    const toggle = document.querySelector(`.panel-toggle[data-panel="${panel}"]`);
    toggle?.classList.remove('active');
  });
});

// ── Resizable columns ───────────────────────────────────────────────

let mapWidth = 340;
let voiceWidth = 320;
const layout = dom.layoutEl as HTMLElement;
const handleL = layout.querySelector('.resize-handle[data-handle="left"]') as HTMLElement;
const handleR = layout.querySelector('.resize-handle[data-handle="right"]') as HTMLElement;

function updateGrid(): void {
  const m = !layout.classList.contains('map-closed');
  const c = !layout.classList.contains('code-closed') || layout.classList.contains('editor-open');
  const v = !layout.classList.contains('voice-closed');

  let template: string;
  let showHL = false;
  let showHR = false;

  if (m && c && v) {
    template = `${mapWidth}px 4px 1fr 4px ${voiceWidth}px`;
    showHL = true; showHR = true;
  } else if (m && c && !v) {
    template = `${mapWidth}px 4px 1fr`;
    showHL = true;
  } else if (m && !c && v) {
    template = `1fr 4px ${voiceWidth}px`;
    showHL = true;
  } else if (!m && c && v) {
    template = `1fr 4px ${voiceWidth}px`;
    showHR = true;
  } else if (m && !c && !v) {
    template = '1fr';
  } else if (!m && c && !v) {
    template = '1fr';
  } else if (!m && !c && v) {
    template = '1fr';
  } else {
    template = '1fr';
  }

  handleL.style.display = showHL ? '' : 'none';
  handleR.style.display = showHR ? '' : 'none';
  layout.style.gridTemplateColumns = template;
}

// Auto-update grid when layout classes change (panel toggles, editor open/close)
new MutationObserver(() => updateGrid()).observe(layout, {
  attributes: true, attributeFilter: ['class'],
});
updateGrid();

// Drag logic
let dragTarget: 'map' | 'voice' | null = null;
let dragStartX = 0;
let dragStartWidth = 0;

function onHandleDown(handle: 'left' | 'right', e: MouseEvent): void {
  e.preventDefault();
  const c = !layout.classList.contains('code-closed') || layout.classList.contains('editor-open');

  if (handle === 'left' && !c) {
    dragTarget = 'voice';
    dragStartWidth = voiceWidth;
  } else if (handle === 'left') {
    dragTarget = 'map';
    dragStartWidth = mapWidth;
  } else {
    dragTarget = 'voice';
    dragStartWidth = voiceWidth;
  }

  dragStartX = e.clientX;
  (handle === 'left' ? handleL : handleR).classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onMouseMove(e: MouseEvent): void {
  if (!dragTarget) return;
  const dx = e.clientX - dragStartX;
  const MIN = 160;
  const MAX = Math.floor(layout.offsetWidth * 0.6);

  if (dragTarget === 'map') {
    mapWidth = Math.max(MIN, Math.min(MAX, dragStartWidth + dx));
  } else {
    voiceWidth = Math.max(MIN, Math.min(MAX, dragStartWidth - dx));
  }
  updateGrid();
}

function onMouseUp(): void {
  if (!dragTarget) return;
  dragTarget = null;
  handleL.classList.remove('dragging');
  handleR.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

handleL.addEventListener('mousedown', (e) => onHandleDown('left', e));
handleR.addEventListener('mousedown', (e) => onHandleDown('right', e));
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);

// ── Wire text input ─────────────────────────────────────────────────

dom.sendBtn.addEventListener('click', () => {
  processInput(dom.textInput.value);
  dom.textInput.value = '';
});

dom.textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    processInput(dom.textInput.value);
    dom.textInput.value = '';
  }
});

// ── Wire speech recognition ─────────────────────────────────────────

initSpeechRecognition(state, dom, processInput, (type, text) => appendLog(type, text, dom));

// ── Boot ────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const resp = await fetch('/data/workflows.jsonl');
  const jsonl = await resp.text();
  state.mgr.loadFromJSONL(jsonl);

  const lines = jsonl.split('\n').filter(l => l.trim());
  if (lines.length > 0) {
    state.currentDef = JSON.parse(lines[0]) as WorkflowDef;
    renderWorkflowMap(state.currentDef, state, dom.workflowMapEl, cb);
    refreshCodeView(state, dom, cb);
  }

  state.mgr.on('enter-state', onAction);
  state.mgr.on('exit-workflow', onAction);
  state.mgr.on('input-captured', onAction);
  state.mgr.on('message', onAction);

  appendLog('system', 'Workflow loaded. Say "transcribe mode" or type it.', dom);
  highlightState(null, state, dom);
}

init();
