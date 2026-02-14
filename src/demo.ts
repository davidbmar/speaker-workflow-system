/**
 * Demo UI — wires Web Speech API → intentClassifier → WorkflowManager → DOM.
 * Includes click-to-edit on workflow map nodes.
 */

import { WorkflowManager, type WorkflowDef, type WorkflowAction, type WorkflowStateDef } from './workflow.js';
import { classifyIntent, INTENT_SIGNALS } from './intentClassifier.js';
import type { WorkflowContext } from './workflowHandlers.js';
import { parseTransitions, parseExitPhrases, parseExitPhrasesNewline, parseKeywords } from './editorUtils.js';
import { renderCodeView } from './codeView.js';

// ── DOM refs ────────────────────────────────────────────────────────

const micBtn = document.getElementById('mic-btn')!;
const textInput = document.getElementById('text-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn')!;
const partialEl = document.getElementById('partial')!;
const intentVal = document.getElementById('intent-val')!;
const scoreVal = document.getElementById('score-val')!;
const stateVal = document.getElementById('state-val')!;
const wordVal = document.getElementById('word-val')!;
const messagesEl = document.getElementById('messages')!;
const bufferDisplay = document.getElementById('buffer-display')!;
const eventLog = document.getElementById('event-log')!;
const workflowMapEl = document.getElementById('workflow-map')!;
const modeBadge = document.getElementById('mode-badge')!;
const nodeEditor = document.getElementById('node-editor')!;
const layoutEl = document.querySelector('.layout')!;
const codeViewEl = document.getElementById('code-view')!;
const viewToggle = document.getElementById('view-toggle')!;

// ── State ───────────────────────────────────────────────────────────

const mgr = new WorkflowManager();
let currentDef: WorkflowDef | null = null;
const visitedStates = new Set<string>();
let editingNodeId: string | null = null;
let lastClassifiedIntent = '';
let lastActiveStateId = '';
let micPausedForTTS = false;
let idleLabel = 'IDLE';

interface AddStatePreview {
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

type PreviewSelection = 'from-node' | 'incoming-arrow' | 'new-state' | 'outgoing';

let addStatePreview: AddStatePreview | null = null;
let previewSelection: PreviewSelection = 'new-state';

/** Get display keywords for an intent (first 4 from classifier signals). */
function getKeywords(intent: string): string[] {
  return (INTENT_SIGNALS[intent] ?? []).slice(0, 4);
}

/** Check if a transition target (with or without `:message`) points back to the same state. */
function isSelfLoopTransition(target: string, stateId: string): boolean {
  if (target === stateId) return true;
  const colonIdx = target.indexOf(':');
  if (colonIdx !== -1 && target.slice(0, colonIdx) === stateId) return true;
  return false;
}

// ── Load workflow from JSONL ────────────────────────────────────────

async function init() {
  const resp = await fetch('/data/workflows.jsonl');
  const jsonl = await resp.text();
  mgr.loadFromJSONL(jsonl);

  const lines = jsonl.split('\n').filter(l => l.trim());
  if (lines.length > 0) {
    currentDef = JSON.parse(lines[0]) as WorkflowDef;
    renderWorkflowMap(currentDef);
    refreshCodeView();
  }

  mgr.on('enter-state', onAction);
  mgr.on('exit-workflow', onAction);
  mgr.on('input-captured', onAction);
  mgr.on('message', onAction);

  appendLog('system', 'Workflow loaded. Say "transcribe mode" or type it.');
  highlightState(null);
}

// ── Code view + toggle ──────────────────────────────────────────────

function refreshCodeView() {
  if (!currentDef) return;
  renderCodeView(currentDef, codeViewEl, (nodeId) => openEditor(nodeId));
}

function highlightCodeBlock(nodeId: string) {
  document.querySelectorAll('.code-block.code-active')
    .forEach(b => b.classList.remove('code-active'));
  document.querySelectorAll('.code-line.code-active')
    .forEach(b => b.classList.remove('code-active'));
  const block = document.querySelector(`[data-code-for="${nodeId}"]`);
  block?.classList.add('code-active');
  block?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function highlightCodeArrow(fromState: string | undefined, intent: string) {
  document.querySelectorAll('.code-block.code-active')
    .forEach(b => b.classList.remove('code-active'));
  document.querySelectorAll('.code-line.code-active')
    .forEach(b => b.classList.remove('code-active'));
  if (!fromState) return;
  const line = document.querySelector(`[data-code-arrow="${fromState}:${intent}"]`);
  line?.classList.add('code-active');
  // Also highlight the parent block
  const block = line?.closest('.code-block');
  block?.classList.add('code-active');
  line?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

viewToggle.addEventListener('click', () => {
  layoutEl.classList.toggle('interaction-mode');
  viewToggle.textContent = layoutEl.classList.contains('interaction-mode')
    ? 'CODE' : 'INTERACT';
});

// ── Workflow map rendering ──────────────────────────────────────────

/** Info attached to an arrow for editing. */
interface ArrowContext {
  intent: string;            // the intent label (e.g. "confirm", "transcribe")
  fromStateId?: string;      // the source state that owns this transition (undefined for trigger)
  target?: string;           // the target state id or "exit"
  isExitPhrase?: boolean;    // true for the "exit phrase" arrow on capture states
}

function renderWorkflowMap(def: WorkflowDef) {
  workflowMapEl.innerHTML = '';

  // IDLE node
  workflowMapEl.appendChild(makeNode('idle', idleLabel, `say "${def.triggerIntent} mode"`, true));
  workflowMapEl.appendChild(makeArrow({ intent: def.triggerIntent }));

  // Initial state
  const initial = def.states[def.initialState];
  if (!initial) return;
  const initialNode = makeNode(initial.id, initial.id.toUpperCase(), initial.onEnter, true);
  addSelfLoopBadge(initialNode, initial);
  workflowMapEl.appendChild(initialNode);

  // Branch arms
  const transitionEntries = Object.entries(initial.transitions).filter(([k]) => k !== '*');
  if (transitionEntries.length > 0) {
    const branch = document.createElement('div');
    branch.className = 'wf-branch';

    for (const [intent, target] of transitionEntries) {
      const arm = document.createElement('div');
      arm.className = 'wf-branch-arm';
      arm.appendChild(makeArrow({ intent, fromStateId: initial.id, target }));

      if (target === 'exit' || target.startsWith('exit:')) {
        const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
        arm.appendChild(makeNode('exit-' + intent, 'EXIT', truncate(exitMsg, 40), true));
      } else {
        renderStateChain(arm, def, target);
      }
      branch.appendChild(arm);
    }
    workflowMapEl.appendChild(branch);
  }

  // Add State button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-state-btn';
  addBtn.textContent = '+ ADD STATE';
  addBtn.addEventListener('click', () => openAddStateEditor(def));
  workflowMapEl.appendChild(addBtn);
}

function renderStateChain(container: HTMLElement, def: WorkflowDef, stateId: string) {
  const state = def.states[stateId];
  if (!state) return;

  const hint = state.handler ? `handler: ${state.handler}` : state.onEnter;
  const stateNode = makeNode(state.id, state.id.toUpperCase(), hint, true);
  addSelfLoopBadge(stateNode, state);
  container.appendChild(stateNode);

  const transitions = Object.entries(state.transitions).filter(([k]) => k !== '*');
  if (transitions.length > 0) {
    for (const [intent, target] of transitions) {
      container.appendChild(makeArrow({ intent, fromStateId: stateId, target }));
      if (target === 'exit' || target.startsWith('exit:')) {
        const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
        container.appendChild(makeNode('exit-' + stateId, 'EXIT', truncate(exitMsg, 40), true));
      } else {
        renderStateChain(container, def, target);
      }
    }
  } else {
    // Terminal/capture state — show exit phrases
    container.appendChild(makeArrow({ intent: 'exit phrase', isExitPhrase: true }));
    container.appendChild(makeNode('exit', 'EXIT', truncate(def.exitMessage, 40), true));
  }
}

function makeNode(id: string, label: string, hint: string, editable: boolean): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-node';
  div.dataset.node = id;
  if (id === 'exit' || id.startsWith('exit-')) div.classList.add('exit-node');
  if (editable) {
    div.classList.add('editable');
    div.addEventListener('click', () => {
      highlightCodeBlock(id);
      openEditor(id);
    });
  }
  div.innerHTML = `<div class="node-id">${label}</div><div class="node-hint">${escHtml(truncate(hint, 50))}</div>`;
  return div;
}

function makeArrow(ctx: ArrowContext): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-arrow editable';
  const keywords = ctx.isExitPhrase
    ? (currentDef?.exitPhrases.slice(0, 3) ?? [])
    : getKeywords(ctx.intent);
  let html = `<div class="arrow-line"></div><div class="arrow-label">${ctx.intent}</div>`;
  if (keywords.length > 0) {
    html += `<div class="arrow-keywords">${keywords.map(k => `"${escHtml(k)}"`).join(', ')}</div>`;
  }
  html += `<div class="arrow-head">\u25BC</div>`;
  div.innerHTML = html;
  div.addEventListener('click', () => {
    highlightCodeArrow(ctx.fromStateId, ctx.intent);
    openArrowEditor(ctx);
  });
  return div;
}

function addSelfLoopBadge(nodeEl: HTMLDivElement, state: WorkflowStateDef) {
  const wildcard = state.transitions['*'];
  if (!wildcard || !isSelfLoopTransition(wildcard, state.id)) return;
  const maxLabel = state.maxTurns ? ` (max ${state.maxTurns})` : '';
  const badge = document.createElement('span');
  badge.className = 'self-loop-badge';
  badge.textContent = `\u21BB *${maxLabel}`;
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    openArrowEditor({ intent: '*', fromStateId: state.id, target: wildcard });
  });
  nodeEl.appendChild(badge);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

// ── Click-to-edit ───────────────────────────────────────────────────

function openEditor(nodeId: string) {
  if (!currentDef) return;

  // Clear previous editing highlight
  document.querySelectorAll('.wf-node.editing').forEach(n => n.classList.remove('editing'));
  const nodeEl = document.querySelector(`[data-node="${nodeId}"]`);
  nodeEl?.classList.add('editing');
  editingNodeId = nodeId;

  nodeEditor.innerHTML = '';
  nodeEditor.classList.add('open');
  layoutEl.classList.add('editor-open');

  if (nodeId === 'idle') {
    // Edit trigger intent + display label
    renderEditorFields('Trigger', [
      { key: 'idleLabel', label: 'Display Label', value: idleLabel },
      { key: 'triggerIntent', label: 'Trigger Intent', value: currentDef.triggerIntent },
    ]);
  } else if (nodeId === 'exit' || nodeId.startsWith('exit-')) {
    // Edit exit config
    renderEditorFields('Exit', [
      { key: 'exitMessage', label: 'Exit Message', value: currentDef.exitMessage, multiline: true },
      { key: 'exitPhrases', label: 'Exit Phrases (comma-separated)', value: currentDef.exitPhrases.join(', '), multiline: true },
    ]);
  } else {
    // Edit a state
    const state = currentDef.states[nodeId];
    if (!state) return;
    const fields: EditorField[] = [
      { key: 'stateId', label: 'State ID (rename)', value: state.id },
      { key: 'onEnter', label: 'On Enter Message', value: state.onEnter, multiline: true },
    ];
    if (state.handler) {
      fields.push({ key: 'handler', label: 'Handler', value: state.handler });
    }
    // Show transitions
    const transKeys = Object.keys(state.transitions);
    if (transKeys.length > 0) {
      const transStr = transKeys.map(k => `${k} → ${state.transitions[k]}`).join('\n');
      fields.push({ key: 'transitions', label: 'Transitions (intent → target, one per line)', value: transStr, multiline: true });
    }
    renderEditorFields(`State: ${nodeId}`, fields);
  }
}

interface EditorField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

function renderEditorFields(title: string, fields: EditorField[]) {
  const titleRow = document.createElement('div');
  titleRow.className = 'editor-title';
  titleRow.innerHTML = `<span>${escHtml(title)}</span><button class="editor-close">\u00D7</button>`;
  titleRow.querySelector('.editor-close')!.addEventListener('click', closeEditor);
  nodeEditor.appendChild(titleRow);

  const fieldEls: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};

  for (const f of fields) {
    const container = document.createElement('div');
    container.className = 'editor-field';
    const label = document.createElement('label');
    label.textContent = f.label;
    container.appendChild(label);

    if (f.multiline) {
      const ta = document.createElement('textarea');
      ta.value = f.value;
      container.appendChild(ta);
      fieldEls[f.key] = ta;
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = f.value;
      container.appendChild(inp);
      fieldEls[f.key] = inp;
    }
    nodeEditor.appendChild(container);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save';
  saveBtn.textContent = 'SAVE & RELOAD';
  saveBtn.addEventListener('click', () => {
    applyEdits(fieldEls);
  });
  nodeEditor.appendChild(saveBtn);
}

function applyEdits(fieldEls: Record<string, HTMLInputElement | HTMLTextAreaElement>) {
  if (!currentDef || !editingNodeId) return;
  const def = currentDef;

  if (editingNodeId === 'idle') {
    if (fieldEls['idleLabel']) {
      idleLabel = fieldEls['idleLabel'].value.trim() || 'IDLE';
    }
    def.triggerIntent = fieldEls['triggerIntent']?.value.trim() || def.triggerIntent;
  } else if (editingNodeId === 'exit' || editingNodeId.startsWith('exit-')) {
    if (fieldEls['exitMessage']) {
      def.exitMessage = fieldEls['exitMessage'].value;
    }
    if (fieldEls['exitPhrases']) {
      def.exitPhrases = parseExitPhrases(fieldEls['exitPhrases'].value);
    }
  } else {
    const state = def.states[editingNodeId];
    if (!state) return;

    // Handle state rename
    if (fieldEls['stateId']) {
      const newId = fieldEls['stateId'].value.trim().toLowerCase().replace(/\s+/g, '_');
      if (newId && newId !== editingNodeId) {
        renameState(def, editingNodeId, newId);
      }
    }

    // Apply field edits (use new ID if renamed)
    const currentId = fieldEls['stateId']
      ? (fieldEls['stateId'].value.trim().toLowerCase().replace(/\s+/g, '_') || editingNodeId)
      : editingNodeId;
    const updatedState = def.states[currentId];
    if (!updatedState) return;

    if (fieldEls['onEnter']) {
      updatedState.onEnter = fieldEls['onEnter'].value;
    }
    if (fieldEls['handler']) {
      updatedState.handler = fieldEls['handler'].value.trim() || undefined;
    }
    if (fieldEls['transitions']) {
      updatedState.transitions = parseTransitions(fieldEls['transitions'].value);
    }
  }

  // Re-register with WorkflowManager
  mgr.register(def);

  // Re-render map
  renderWorkflowMap(def);
  refreshCodeView();
  highlightState(mgr.getActiveStateId());

  closeEditor();
  appendLog('system', `Config updated: ${editingNodeId}`);
}

function openArrowEditor(ctx: ArrowContext) {
  if (!currentDef) return;

  // Clear previous highlights
  document.querySelectorAll('.wf-node.editing').forEach(n => n.classList.remove('editing'));
  document.querySelectorAll('.wf-arrow.editing').forEach(n => n.classList.remove('editing'));
  editingNodeId = `arrow:${ctx.intent}`;

  nodeEditor.innerHTML = '';
  nodeEditor.classList.add('open');
  layoutEl.classList.add('editor-open');

  if (ctx.isExitPhrase) {
    // Edit exit phrases
    renderEditorFields('Exit Phrases', [
      { key: 'exitPhrases', label: 'Exit Phrases (one per line)', value: currentDef.exitPhrases.join('\n'), multiline: true },
    ]);
    return;
  }

  const fields: EditorField[] = [];

  // Keywords that trigger this intent
  const signals = INTENT_SIGNALS[ctx.intent] ?? [];
  fields.push({
    key: 'keywords',
    label: `Keywords for "${ctx.intent}" (one per line)`,
    value: signals.join('\n'),
    multiline: true,
  });

  // Transition target (what state does this intent lead to)
  if (ctx.fromStateId && ctx.target) {
    const isExit = ctx.target === 'exit' || ctx.target.startsWith('exit:');
    const targetDisplay = isExit ? 'exit' : ctx.target;
    fields.push({
      key: 'target',
      label: `Target state (currently: ${targetDisplay})`,
      value: targetDisplay,
    });
    // If it's an exit transition, show the exit message
    if (isExit) {
      const exitMsg = ctx.target.startsWith('exit:') ? ctx.target.slice(5) : currentDef.exitMessage;
      fields.push({
        key: 'exitMessage',
        label: 'Exit message for this transition',
        value: exitMsg,
        multiline: true,
      });
    }
  }

  const targetLabel = ctx.target
    ? (ctx.target === 'exit' || ctx.target.startsWith('exit:') ? 'EXIT' : ctx.target)
    : '?';
  const title = ctx.fromStateId
    ? `Transition: ${ctx.fromStateId} \u2192 [${ctx.intent}] \u2192 ${targetLabel}`
    : `Trigger: ${ctx.intent}`;

  renderArrowEditorFields(title, fields, ctx);
}

function renderArrowEditorFields(title: string, fields: EditorField[], ctx: ArrowContext) {
  const titleRow = document.createElement('div');
  titleRow.className = 'editor-title';
  titleRow.innerHTML = `<span>${escHtml(title)}</span><button class="editor-close">\u00D7</button>`;
  titleRow.querySelector('.editor-close')!.addEventListener('click', closeEditor);
  nodeEditor.appendChild(titleRow);

  const fieldEls: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};

  for (const f of fields) {
    const container = document.createElement('div');
    container.className = 'editor-field';
    const label = document.createElement('label');
    label.textContent = f.label;
    container.appendChild(label);

    if (f.multiline) {
      const ta = document.createElement('textarea');
      ta.value = f.value;
      ta.rows = Math.min(8, f.value.split('\n').length + 1);
      container.appendChild(ta);
      fieldEls[f.key] = ta;
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = f.value;
      container.appendChild(inp);
      fieldEls[f.key] = inp;
    }
    nodeEditor.appendChild(container);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save';
  saveBtn.textContent = 'SAVE & RELOAD';
  saveBtn.addEventListener('click', () => applyArrowEdits(fieldEls, ctx));
  nodeEditor.appendChild(saveBtn);
}

function applyArrowEdits(fieldEls: Record<string, HTMLInputElement | HTMLTextAreaElement>, ctx: ArrowContext) {
  if (!currentDef) return;
  const def = currentDef;

  if (ctx.isExitPhrase && fieldEls['exitPhrases']) {
    def.exitPhrases = parseExitPhrasesNewline(fieldEls['exitPhrases'].value);
    mgr.register(def);
    renderWorkflowMap(def);
    refreshCodeView();
    highlightState(mgr.getActiveStateId());
    closeEditor();
    appendLog('system', 'Exit phrases updated.');
    return;
  }

  // Update classifier keywords
  if (fieldEls['keywords']) {
    const newSignals = parseKeywords(fieldEls['keywords'].value);
    INTENT_SIGNALS[ctx.intent] = newSignals;
    appendLog('system', `Keywords for "${ctx.intent}" updated (${newSignals.length} signals).`);
  }

  // Update transition target + exit message
  if (ctx.fromStateId) {
    const state = def.states[ctx.fromStateId];
    if (state) {
      let newTarget = fieldEls['target']?.value.trim() ?? ctx.target ?? '';
      // If target is "exit" and there's a custom exit message, encode it
      if (newTarget === 'exit' && fieldEls['exitMessage']) {
        const msg = fieldEls['exitMessage'].value.trim();
        if (msg && msg !== def.exitMessage) {
          newTarget = `exit:${msg}`;
        }
      } else if (newTarget.startsWith('exit:') && fieldEls['exitMessage']) {
        const msg = fieldEls['exitMessage'].value.trim();
        newTarget = msg ? `exit:${msg}` : 'exit';
      }
      state.transitions[ctx.intent] = newTarget;
      mgr.register(def);
      appendLog('system', `Transition ${ctx.fromStateId}/${ctx.intent} updated.`);
    }
  }

  renderWorkflowMap(def);
  refreshCodeView();
  highlightState(mgr.getActiveStateId());
  closeEditor();
}

function openAddStateEditor(def: WorkflowDef) {
  document.querySelectorAll('.wf-node.editing').forEach(n => n.classList.remove('editing'));
  document.querySelectorAll('.wf-arrow.editing').forEach(n => n.classList.remove('editing'));
  editingNodeId = '__add_state__';

  const existingIds = Object.keys(def.states);
  const lastState = existingIds[existingIds.length - 1] || def.initialState;

  addStatePreview = {
    stateId: '',
    onEnter: '',
    transitions: {},
    connectFrom: lastState,
    connectIntent: '',
    intentKeywords: [],
  };
  previewSelection = 'new-state';

  renderAddStatePanel(def);
}

function renderAddStatePanel(def: WorkflowDef) {
  nodeEditor.innerHTML = '';
  nodeEditor.classList.add('open');
  layoutEl.classList.add('editor-open');

  // Title row
  const titleRow = document.createElement('div');
  titleRow.className = 'editor-title';
  titleRow.innerHTML = `<span>Add New State</span><button class="editor-close">\u00D7</button>`;
  titleRow.querySelector('.editor-close')!.addEventListener('click', closeEditor);
  nodeEditor.appendChild(titleRow);

  // Preview graph
  const previewContainer = document.createElement('div');
  previewContainer.className = 'add-state-preview';
  renderPreviewGraph(previewContainer, def);
  nodeEditor.appendChild(previewContainer);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'preview-divider';
  nodeEditor.appendChild(divider);

  // Inline fields based on selection
  renderPreviewFields(def);

  // CREATE STATE button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save';
  saveBtn.textContent = 'CREATE STATE';
  saveBtn.addEventListener('click', () => applyAddState(def));
  nodeEditor.appendChild(saveBtn);
}

function renderPreviewGraph(container: HTMLElement, def: WorkflowDef) {
  if (!addStatePreview) return;
  const p = addStatePreview;

  // FROM node
  const fromLabel = p.connectFrom ? p.connectFrom.toUpperCase() : '???';
  const fromHint = p.connectFrom && def.states[p.connectFrom]
    ? truncate(def.states[p.connectFrom].onEnter, 30)
    : 'select source state';
  const fromNode = makePreviewNode(
    p.connectFrom || 'from', fromLabel, fromHint, 'from-node', def
  );
  container.appendChild(fromNode);

  // Incoming arrow
  const arrowIntentLabel = p.connectIntent || '???';
  const arrowEl = makePreviewArrow(arrowIntentLabel, p.intentKeywords, 'incoming-arrow', def);
  container.appendChild(arrowEl);

  // NEW STATE node
  const newLabel = p.stateId ? p.stateId.toUpperCase() : 'NEW STATE';
  const newHint = p.onEnter ? truncate(p.onEnter, 30) : 'click to configure';
  const newNode = makePreviewNode('new-state', newLabel, newHint, 'new-state', def);
  container.appendChild(newNode);

  // Outgoing area
  const outgoing = document.createElement('div');
  outgoing.className = 'preview-outgoing-area';
  if (previewSelection === 'outgoing') outgoing.classList.add('preview-selected');
  const transCount = Object.keys(p.transitions).length;
  if (transCount > 0) {
    const summary = Object.entries(p.transitions)
      .map(([k, v]) => `${k} \u2192 ${v}`).join(', ');
    outgoing.textContent = truncate(summary, 40);
  } else {
    outgoing.textContent = '+ add transitions';
  }
  outgoing.addEventListener('click', () => {
    previewSelection = 'outgoing';
    renderAddStatePanel(def);
  });
  container.appendChild(outgoing);
}

function makePreviewNode(
  _id: string, label: string, hint: string,
  selection: PreviewSelection, def: WorkflowDef
): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-node editable';
  if (previewSelection === selection) div.classList.add('preview-selected');
  div.innerHTML = `<div class="node-id">${escHtml(label)}</div><div class="node-hint">${escHtml(hint)}</div>`;
  div.addEventListener('click', () => {
    previewSelection = selection;
    renderAddStatePanel(def);
  });
  return div;
}

function makePreviewArrow(
  intentLabel: string, keywords: string[],
  selection: PreviewSelection, def: WorkflowDef
): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-arrow editable';
  if (previewSelection === selection) div.classList.add('preview-selected');
  let html = `<div class="arrow-line"></div><div class="arrow-label">${escHtml(intentLabel)}</div>`;
  if (keywords.length > 0) {
    html += `<div class="arrow-keywords">${keywords.slice(0, 3).map(k => `"${escHtml(k)}"`).join(', ')}</div>`;
  }
  html += `<div class="arrow-head">\u25BC</div>`;
  div.innerHTML = html;
  div.addEventListener('click', () => {
    previewSelection = selection;
    renderAddStatePanel(def);
  });
  return div;
}

function makeEditorField(
  key: string, label: string, value: string, multiline: boolean,
  onChange: (val: string) => void
): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  container.appendChild(lbl);

  if (multiline) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.rows = Math.max(2, value.split('\n').length + 1);
    ta.dataset.fieldKey = key;
    ta.addEventListener('blur', () => onChange(ta.value));
    container.appendChild(ta);
  } else {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value;
    inp.dataset.fieldKey = key;
    inp.addEventListener('blur', () => onChange(inp.value));
    container.appendChild(inp);
  }
  return container;
}

function renderPreviewFields(def: WorkflowDef) {
  if (!addStatePreview) return;
  const p = addStatePreview;

  switch (previewSelection) {
    case 'from-node': {
      const selectorDiv = document.createElement('div');
      selectorDiv.className = 'state-selector';

      // Regular states
      const existingIds = Object.keys(def.states);
      for (const sid of existingIds) {
        const btn = document.createElement('button');
        btn.className = 'state-selector-option';
        if (p.connectFrom === sid && !p.connectIntent) btn.classList.add('selected');
        btn.textContent = sid;
        btn.addEventListener('click', () => {
          p.connectFrom = sid;
          p.connectIntent = '';
          renderAddStatePanel(def);
        });
        selectorDiv.appendChild(btn);
      }

      // Exit transitions — lets user replace an exit with the new state
      for (const sid of existingIds) {
        const state = def.states[sid];
        for (const [intent, target] of Object.entries(state.transitions)) {
          if (intent === '*') continue;
          if (target === 'exit' || target.startsWith('exit:')) {
            const btn = document.createElement('button');
            btn.className = 'state-selector-option exit-option';
            const isSelected = p.connectFrom === sid && p.connectIntent === intent;
            if (isSelected) btn.classList.add('selected');
            btn.textContent = `${sid} / ${intent} \u2192 EXIT`;
            btn.addEventListener('click', () => {
              p.connectFrom = sid;
              p.connectIntent = intent;
              renderAddStatePanel(def);
            });
            selectorDiv.appendChild(btn);
          }
        }
      }

      nodeEditor.appendChild(selectorDiv);
      break;
    }
    case 'incoming-arrow': {
      nodeEditor.appendChild(makeEditorField(
        'connectIntent', 'Intent name', p.connectIntent, false,
        (val) => { p.connectIntent = val.trim(); refreshPreviewGraph(def); }
      ));
      nodeEditor.appendChild(makeEditorField(
        'intentKeywords', 'Keywords (one per line)', p.intentKeywords.join('\n'), true,
        (val) => { p.intentKeywords = parseKeywords(val); refreshPreviewGraph(def); }
      ));
      break;
    }
    case 'new-state': {
      const idField = makeEditorField(
        'stateId', 'State ID', p.stateId, false,
        (val) => {
          p.stateId = val.trim().toLowerCase().replace(/\s+/g, '_');
          refreshPreviewGraph(def);
        }
      );
      // Auto-normalize on blur is handled by the onChange above
      nodeEditor.appendChild(idField);
      nodeEditor.appendChild(makeEditorField(
        'onEnter', 'On Enter Message', p.onEnter, true,
        (val) => { p.onEnter = val; refreshPreviewGraph(def); }
      ));
      nodeEditor.appendChild(makeEditorField(
        'handler', 'Handler (accumulate, bullets, or blank)', p.handler || '', false,
        (val) => { p.handler = val.trim() || undefined; }
      ));
      nodeEditor.appendChild(makeEditorField(
        'maxTurns', 'Max Turns (number, optional)', p.maxTurns != null ? String(p.maxTurns) : '', false,
        (val) => {
          const n = parseInt(val, 10);
          p.maxTurns = isNaN(n) ? undefined : n;
        }
      ));
      break;
    }
    case 'outgoing': {
      const transStr = Object.entries(p.transitions)
        .map(([k, v]) => `${k} \u2192 ${v}`).join('\n');
      nodeEditor.appendChild(makeEditorField(
        'transitions', 'Transitions (intent \u2192 target, one per line)', transStr, true,
        (val) => { p.transitions = parseTransitions(val); refreshPreviewGraph(def); }
      ));
      break;
    }
  }
}

function refreshPreviewGraph(def: WorkflowDef) {
  const previewContainer = nodeEditor.querySelector('.add-state-preview');
  if (!previewContainer) return;
  previewContainer.innerHTML = '';
  renderPreviewGraph(previewContainer as HTMLElement, def);
}

function applyAddState(def: WorkflowDef) {
  if (!addStatePreview) return;
  const p = addStatePreview;

  const stateId = p.stateId.trim().toLowerCase().replace(/\s+/g, '_');
  if (!stateId) { alert('State ID is required.'); return; }
  if (def.states[stateId]) { alert(`State "${stateId}" already exists.`); return; }

  const newState: WorkflowStateDef = {
    id: stateId,
    onEnter: p.onEnter || `Entered ${stateId}.`,
    transitions: { ...p.transitions },
    handler: p.handler || undefined,
  };

  if (p.maxTurns != null) {
    newState.maxTurns = p.maxTurns;
    if (p.maxTurnsTarget) newState.maxTurnsTarget = p.maxTurnsTarget;
  }

  def.states[stateId] = newState;

  // Wire incoming transition
  const connectFrom = p.connectFrom.trim();
  const connectIntent = p.connectIntent.trim();
  if (connectFrom && connectIntent && def.states[connectFrom]) {
    def.states[connectFrom].transitions[connectIntent] = stateId;
  }

  // Register intent keywords
  const keywords = p.intentKeywords;
  if (connectIntent && keywords.length > 0) {
    INTENT_SIGNALS[connectIntent] = keywords;
  }

  addStatePreview = null;
  mgr.register(def);
  renderWorkflowMap(def);
  refreshCodeView();
  highlightState(mgr.getActiveStateId());
  closeEditor();
  appendLog('system', `State "${stateId}" created.`);
}

/** Rename a state ID across the entire workflow definition. */
function renameState(def: WorkflowDef, oldId: string, newId: string) {
  if (def.states[newId]) return; // target ID already taken
  const state = def.states[oldId];
  if (!state) return;

  // Move state entry
  state.id = newId;
  def.states[newId] = state;
  delete def.states[oldId];

  // Update initialState
  if (def.initialState === oldId) {
    def.initialState = newId;
  }

  // Re-wire all transitions that reference oldId
  for (const s of Object.values(def.states)) {
    for (const [intent, target] of Object.entries(s.transitions)) {
      if (target === oldId) {
        s.transitions[intent] = newId;
      } else {
        // Handle "stateId:message" format
        const colonIdx = target.indexOf(':');
        if (colonIdx !== -1 && target.slice(0, colonIdx) === oldId) {
          s.transitions[intent] = newId + target.slice(colonIdx);
        }
      }
    }
    // Update maxTurnsTarget
    if (s.maxTurnsTarget === oldId) {
      s.maxTurnsTarget = newId;
    } else if (s.maxTurnsTarget) {
      const colonIdx = s.maxTurnsTarget.indexOf(':');
      if (colonIdx !== -1 && s.maxTurnsTarget.slice(0, colonIdx) === oldId) {
        s.maxTurnsTarget = newId + s.maxTurnsTarget.slice(colonIdx);
      }
    }
  }
}

function closeEditor() {
  nodeEditor.classList.remove('open');
  layoutEl.classList.remove('editor-open');
  nodeEditor.innerHTML = '';
  document.querySelectorAll('.wf-node.editing').forEach(n => n.classList.remove('editing'));
  document.querySelectorAll('.wf-arrow.editing').forEach(n => n.classList.remove('editing'));
  editingNodeId = null;
}

// ── State highlighting ──────────────────────────────────────────────

function highlightState(stateId: string | null) {
  document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('active'));

  if (stateId === null) {
    document.querySelector('[data-node="idle"]')?.classList.add('active');
    modeBadge.textContent = 'IDLE';
    modeBadge.classList.remove('active');
  } else {
    document.querySelector(`[data-node="${stateId}"]`)?.classList.add('active');
    visitedStates.add(stateId);
    for (const v of visitedStates) {
      const el = document.querySelector(`[data-node="${v}"]`);
      if (el && !el.classList.contains('active')) el.classList.add('visited');
    }
    if (currentDef?.ui) {
      modeBadge.textContent = currentDef.ui.indicatorLabel;
      modeBadge.classList.add('active');
    }
  }
}

function findExitNodeId(): string {
  // Try exit-{intent} first (branch exit, e.g. exit-deny)
  const byIntent = document.querySelector(`[data-node="exit-${lastClassifiedIntent}"]`);
  if (byIntent) return `exit-${lastClassifiedIntent}`;
  // Try exit-{sourceState} (chain exit, e.g. exit-recording)
  const byState = document.querySelector(`[data-node="exit-${lastActiveStateId}"]`);
  if (byState) return `exit-${lastActiveStateId}`;
  // Fallback to generic exit
  return 'exit';
}

function highlightExit() {
  const exitId = findExitNodeId();
  document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-node="${exitId}"]`)?.classList.add('active');
  setTimeout(() => {
    visitedStates.clear();
    document.querySelectorAll('.wf-node.visited').forEach(n => n.classList.remove('visited'));
    highlightState(null);
  }, 2000);
}

// ── TTS (Web Speech Synthesis) ──────────────────────────────────────

function speak(text: string) {
  if (!window.speechSynthesis) return;
  // Cancel any in-progress speech
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  utter.lang = 'en-US';
  // Pause mic to prevent echo
  if (listening && recognition) {
    recognition.stop();
    micPausedForTTS = true;
  }
  utter.onend = () => {
    if (micPausedForTTS && listening) {
      recognition.start();
      micPausedForTTS = false;
    }
  };
  window.speechSynthesis.speak(utter);
}

// ── Speech bubble on active node ────────────────────────────────────

function showSpeechBubble(stateId: string, message: string) {
  // Clear any existing bubbles
  document.querySelectorAll('.speech-bubble').forEach(b => b.remove());

  const node = document.querySelector(`[data-node="${stateId}"]`);
  if (!node) return;

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.textContent = message;
  document.body.appendChild(bubble);

  // Position to the right of the node using fixed coordinates
  const rect = node.getBoundingClientRect();
  bubble.style.left = `${rect.right + 10}px`;
  bubble.style.top = `${rect.top + rect.height / 2}px`;
  bubble.style.transform = 'translateY(-50%)';
}

function clearSpeechBubbles() {
  document.querySelectorAll('.speech-bubble').forEach(b => b.remove());
}

// ── Event handling ──────────────────────────────────────────────────

function onAction(action: WorkflowAction) {
  switch (action.type) {
    case 'enter-state':
      highlightState(action.stateId);
      stateVal.textContent = action.stateId;
      stateVal.classList.add('highlight');
      addMessage(action.message, 'system');
      appendLog('enter-state', `\u2192 ${action.stateId}: ${action.message}`);
      // Speak the onEnter message and show it on the node
      speak(action.message);
      showSpeechBubble(action.stateId, action.message);
      break;
    case 'input-captured':
      appendLog('input-captured', `buffer updated (${action.stateId})`);
      updateBuffer(mgr.getContext());
      break;
    case 'exit-workflow': {
      const exitNodeId = findExitNodeId();
      highlightExit();
      stateVal.textContent = 'idle';
      stateVal.classList.remove('highlight');
      modeBadge.textContent = 'IDLE';
      modeBadge.classList.remove('active');
      addMessage(action.message, 'system');
      appendLog('exit-workflow', action.message);
      // Speak the exit message
      speak(action.message);
      showSpeechBubble(exitNodeId, action.message);
      setTimeout(() => {
        bufferDisplay.textContent = '';
        wordVal.textContent = '0';
        clearSpeechBubbles();
      }, 3000);
      break;
    }
    case 'message':
      addMessage(action.message, 'system');
      appendLog('message', action.message);
      speak(action.message);
      break;
  }
}

// ── Input processing ────────────────────────────────────────────────

function processInput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(trimmed, 'user');

  // Save active state before handleInput (needed for exit node highlighting)
  lastActiveStateId = mgr.getActiveStateId() ?? '';

  if (mgr.isActive()) {
    if (mgr.isCapturing()) {
      intentVal.textContent = '-';
      scoreVal.textContent = '-';
      lastClassifiedIntent = 'unknown';
      appendLog('input-captured', `"${trimmed}" (classifier bypassed)`);
      mgr.handleInput(trimmed, 'unknown');
      updateBuffer(mgr.getContext());
      return;
    }
    const { intent, score } = classifyIntent(trimmed);
    intentVal.textContent = intent;
    scoreVal.textContent = String(score);
    lastClassifiedIntent = intent;
    appendLog('intent', `"${trimmed}" \u2192 ${intent} (score: ${score})`);
    mgr.handleInput(trimmed, intent);
    if (mgr.isActive()) updateBuffer(mgr.getContext());
    return;
  }

  const { intent, score } = classifyIntent(trimmed);
  intentVal.textContent = intent;
  scoreVal.textContent = String(score);
  lastClassifiedIntent = intent;
  appendLog('intent', `"${trimmed}" \u2192 ${intent} (score: ${score})`);

  const result = mgr.handleInput(trimmed, intent);
  if (!result.consumed) {
    appendLog('intent', 'Not consumed \u2014 would fall through to normal pipeline.');
  }
  if (mgr.isActive()) updateBuffer(mgr.getContext());
}

// ── UI helpers ──────────────────────────────────────────────────────

function addMessage(text: string, type: 'system' | 'user') {
  const div = document.createElement('div');
  div.className = `msg-bubble ${type}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateBuffer(ctx: Readonly<WorkflowContext>) {
  bufferDisplay.textContent = ctx.buffer || '';
  const wc = ctx.buffer.trim() ? ctx.buffer.trim().split(/\s+/).length : 0;
  wordVal.textContent = String(wc);
}

function appendLog(type: string, text: string) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-event type-${type}">${text}</span>`;
  eventLog.appendChild(entry);
  eventLog.scrollTop = eventLog.scrollHeight;
}

// ── Wire text input ─────────────────────────────────────────────────

sendBtn.addEventListener('click', () => {
  processInput(textInput.value);
  textInput.value = '';
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    processInput(textInput.value);
    textInput.value = '';
  }
});

// ── Wire STT (Web Speech API) ───────────────────────────────────────

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: any = null;
let listening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        partialEl.textContent = '';
        processInput(transcript);
      } else {
        interim += transcript;
      }
    }
    if (interim) partialEl.textContent = interim;
  };

  recognition.onerror = (e: any) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      appendLog('system', `STT error: ${e.error}`);
    }
  };

  recognition.onend = () => {
    if (listening && !micPausedForTTS) {
      try { recognition.start(); } catch (_) { /* ignore */ }
    }
  };
} else {
  micBtn.style.opacity = '0.3';
  micBtn.title = 'Speech recognition not supported in this browser';
}

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (listening) {
    listening = false;
    recognition.stop();
    micBtn.classList.remove('listening');
    partialEl.textContent = '';
    appendLog('system', 'Mic off.');
  } else {
    listening = true;
    recognition.start();
    micBtn.classList.add('listening');
    appendLog('system', 'Mic on \u2014 listening...');
  }
});

// ── Boot ────────────────────────────────────────────────────────────

init();
