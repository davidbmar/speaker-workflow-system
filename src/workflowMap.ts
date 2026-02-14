/**
 * workflowMap.ts — Renders the visual workflow graph (nodes, arrows, branches).
 * Click handlers delegate to the callback bag, breaking circular dependencies with editors.
 */

import type { WorkflowDef, WorkflowStateDef } from './workflow.js';
import type { AppState, AppCallbacks, ArrowContext } from './appContext.js';
import { escHtml, truncate, getKeywords, isSelfLoopTransition } from './domUtils.js';

export function renderWorkflowMap(
  def: WorkflowDef,
  state: AppState,
  workflowMapEl: HTMLElement,
  cb: AppCallbacks,
): void {
  workflowMapEl.textContent = '';

  // IDLE node
  workflowMapEl.appendChild(makeNode('idle', state.idleLabel, `say "${def.triggerIntent} mode"`, true, cb));
  workflowMapEl.appendChild(makeArrow({ intent: def.triggerIntent }, def, cb));

  // Initial state
  const initial = def.states[def.initialState];
  if (!initial) return;
  const initialNode = makeNode(initial.id, initial.id.toUpperCase(), initial.onEnter, true, cb);
  addSelfLoopBadge(initialNode, initial, cb);
  workflowMapEl.appendChild(initialNode);

  // Branch arms
  const transitionEntries = Object.entries(initial.transitions).filter(([k]) => k !== '*');
  if (transitionEntries.length > 0) {
    const branch = document.createElement('div');
    branch.className = 'wf-branch';

    for (const [intent, target] of transitionEntries) {
      const arm = document.createElement('div');
      arm.className = 'wf-branch-arm';
      arm.appendChild(makeArrow({ intent, fromStateId: initial.id, target }, def, cb));

      if (target === 'exit' || target.startsWith('exit:')) {
        const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
        arm.appendChild(makeNode('exit-' + intent, 'EXIT', truncate(exitMsg, 40), true, cb));
      } else {
        renderStateChain(arm, def, target, cb);
      }
      branch.appendChild(arm);
    }
    workflowMapEl.appendChild(branch);
  }

  // Add State button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-state-btn';
  addBtn.textContent = '+ ADD STATE';
  addBtn.addEventListener('click', () => cb.openAddStateEditor(def));
  workflowMapEl.appendChild(addBtn);
}

function renderStateChain(
  container: HTMLElement,
  def: WorkflowDef,
  stateId: string,
  cb: AppCallbacks,
): void {
  const s = def.states[stateId];
  if (!s) return;

  const hint = s.handler ? `handler: ${s.handler}` : s.onEnter;
  const stateNode = makeNode(s.id, s.id.toUpperCase(), hint, true, cb);
  addSelfLoopBadge(stateNode, s, cb);
  container.appendChild(stateNode);

  const transitions = Object.entries(s.transitions).filter(([k]) => k !== '*');
  if (transitions.length > 0) {
    for (const [intent, target] of transitions) {
      container.appendChild(makeArrow({ intent, fromStateId: stateId, target }, def, cb));
      if (target === 'exit' || target.startsWith('exit:')) {
        const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
        container.appendChild(makeNode('exit-' + stateId, 'EXIT', truncate(exitMsg, 40), true, cb));
      } else {
        renderStateChain(container, def, target, cb);
      }
    }
  } else {
    // Terminal/capture state — show exit phrases
    container.appendChild(makeArrow({ intent: 'exit phrase', isExitPhrase: true }, def, cb));
    container.appendChild(makeNode('exit', 'EXIT', truncate(def.exitMessage, 40), true, cb));
  }
}

function makeNode(
  id: string, label: string, hint: string, editable: boolean, cb: AppCallbacks,
): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-node';
  div.dataset.node = id;
  if (id === 'exit' || id.startsWith('exit-')) div.classList.add('exit-node');
  if (editable) {
    div.classList.add('editable');
    div.addEventListener('click', () => {
      cb.highlightCodeBlock(id);
      cb.openEditor(id);
    });
  }
  const idEl = document.createElement('div');
  idEl.className = 'node-id';
  idEl.textContent = label;
  const hintEl = document.createElement('div');
  hintEl.className = 'node-hint';
  hintEl.textContent = truncate(hint, 50);
  div.appendChild(idEl);
  div.appendChild(hintEl);
  return div;
}

function makeArrow(ctx: ArrowContext, def: WorkflowDef, cb: AppCallbacks): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'wf-arrow editable';
  const keywords = ctx.isExitPhrase
    ? (def.exitPhrases.slice(0, 3))
    : getKeywords(ctx.intent);

  const line = document.createElement('div');
  line.className = 'arrow-line';
  div.appendChild(line);

  const labelEl = document.createElement('div');
  labelEl.className = 'arrow-label';
  labelEl.textContent = ctx.intent;
  div.appendChild(labelEl);

  if (keywords.length > 0) {
    const kw = document.createElement('div');
    kw.className = 'arrow-keywords';
    kw.textContent = keywords.map(k => `"${k}"`).join(', ');
    div.appendChild(kw);
  }

  const head = document.createElement('div');
  head.className = 'arrow-head';
  head.textContent = '\u25BC';
  div.appendChild(head);

  div.addEventListener('click', () => {
    cb.highlightCodeArrow(ctx.fromStateId, ctx.intent);
    cb.openArrowEditor(ctx);
  });
  return div;
}

function addSelfLoopBadge(nodeEl: HTMLDivElement, s: WorkflowStateDef, cb: AppCallbacks): void {
  const wildcard = s.transitions['*'];
  if (!wildcard || !isSelfLoopTransition(wildcard, s.id)) return;
  const maxLabel = s.maxTurns ? ` (max ${s.maxTurns})` : '';
  const badge = document.createElement('span');
  badge.className = 'self-loop-badge';
  badge.textContent = `\u21BB *${maxLabel}`;
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    cb.openArrowEditor({ intent: '*', fromStateId: s.id, target: wildcard });
  });
  nodeEl.appendChild(badge);
}
