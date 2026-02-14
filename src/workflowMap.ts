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
  const rendered = new Set<string>();

  // IDLE node
  workflowMapEl.appendChild(makeNode('idle', state.idleLabel, `say "${def.triggerIntent} mode"`, true, cb));
  workflowMapEl.appendChild(makeArrow({ intent: def.triggerIntent }, def, cb));

  // Initial state
  const initial = def.states[def.initialState];
  if (!initial) return;
  rendered.add(initial.id);
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
      } else if (rendered.has(target)) {
        arm.appendChild(makeLinkTarget(target));
      } else {
        renderStateChain(arm, def, target, cb, rendered);
      }
      branch.appendChild(arm);
    }
    const vline = document.createElement('div');
    vline.className = 'branch-vline';
    workflowMapEl.appendChild(vline);
    branch.style.setProperty('--arm-count', String(transitionEntries.length));
    workflowMapEl.appendChild(branch);
  }

  // Add State button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-state-btn';
  addBtn.textContent = '+ ADD STATE';
  addBtn.addEventListener('click', () => cb.openAddStateEditor(def));
  workflowMapEl.appendChild(addBtn);

  // Draw SVG connectors from link targets to their real counterparts.
  // Redraw on resize so connectors stay attached when panels are resized.
  requestAnimationFrame(() => drawLinkConnectors(workflowMapEl));
  observeResize(workflowMapEl);
}

function renderStateChain(
  container: HTMLElement,
  def: WorkflowDef,
  stateId: string,
  cb: AppCallbacks,
  rendered: Set<string>,
): void {
  const s = def.states[stateId];
  if (!s) return;
  rendered.add(stateId);

  const hint = s.handler ? `handler: ${s.handler}` : s.onEnter;
  const stateNode = makeNode(s.id, s.id.toUpperCase(), hint, true, cb);
  addSelfLoopBadge(stateNode, s, cb);
  container.appendChild(stateNode);

  const transitions = Object.entries(s.transitions).filter(([k]) => k !== '*');
  if (transitions.length > 1) {
    // Multiple transitions — branch into arms (same layout as initial state)
    const branch = document.createElement('div');
    branch.className = 'wf-branch';
    for (const [intent, target] of transitions) {
      const arm = document.createElement('div');
      arm.className = 'wf-branch-arm';
      arm.appendChild(makeArrow({ intent, fromStateId: stateId, target }, def, cb));
      if (target === 'exit' || target.startsWith('exit:')) {
        const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
        arm.appendChild(makeNode('exit-' + stateId + '-' + intent, 'EXIT', truncate(exitMsg, 40), true, cb));
      } else if (rendered.has(target)) {
        arm.appendChild(makeLinkTarget(target));
      } else {
        renderStateChain(arm, def, target, cb, rendered);
      }
      branch.appendChild(arm);
    }
    const vline = document.createElement('div');
    vline.className = 'branch-vline';
    container.appendChild(vline);
    branch.style.setProperty('--arm-count', String(transitions.length));
    container.appendChild(branch);
  } else if (transitions.length === 1) {
    // Single transition — render inline (no branch needed)
    const [intent, target] = transitions[0];
    container.appendChild(makeArrow({ intent, fromStateId: stateId, target }, def, cb));
    if (target === 'exit' || target.startsWith('exit:')) {
      const exitMsg = target.startsWith('exit:') ? target.slice(5) : def.exitMessage;
      container.appendChild(makeNode('exit-' + stateId, 'EXIT', truncate(exitMsg, 40), true, cb));
    } else if (rendered.has(target)) {
      container.appendChild(makeLinkTarget(target));
    } else {
      renderStateChain(container, def, target, cb, rendered);
    }
  } else {
    // Terminal/capture state — show exit phrases
    container.appendChild(makeArrow({ intent: 'exit phrase', isExitPhrase: true }, def, cb));
    container.appendChild(makeNode('exit-' + stateId, 'EXIT', truncate(def.exitMessage, 40), true, cb));
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

function makeLinkTarget(stateId: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'link-target';
  div.dataset.linkTarget = stateId;
  div.textContent = `↗ ${stateId.toUpperCase()}`;
  div.addEventListener('click', () => {
    const real = document.querySelector(`.wf-node[data-node="${stateId}"]`);
    if (real) {
      real.scrollIntoView({ behavior: 'smooth', block: 'center' });
      real.classList.add('flash');
      real.addEventListener('animationend', () => real.classList.remove('flash'), { once: true });
    }
  });
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

let resizeObserver: ResizeObserver | null = null;

function observeResize(container: HTMLElement): void {
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => drawLinkConnectors(container));
  resizeObserver.observe(container);
  // Also observe the scroll parent (workflow-panel) since column resize changes it directly
  const panel = container.closest('.workflow-panel');
  if (panel) resizeObserver.observe(panel);
}

function drawLinkConnectors(container: HTMLElement): void {
  const old = container.querySelector('.link-connectors');
  if (old) old.remove();

  const targets = container.querySelectorAll('.link-target');
  if (targets.length === 0) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('link-connectors');
  // Use scroll dimensions to cover full content area
  svg.setAttribute('width', String(container.scrollWidth));
  svg.setAttribute('height', String(container.scrollHeight));
  container.appendChild(svg);

  const containerRect = container.getBoundingClientRect();

  targets.forEach(el => {
    const stateId = (el as HTMLElement).dataset.linkTarget;
    if (!stateId) return;
    const real = container.querySelector(`.wf-node[data-node="${stateId}"]`);
    if (!real) return;

    const elRect = el.getBoundingClientRect();
    const realRect = real.getBoundingClientRect();

    // Coordinates relative to container's top-left, accounting for scroll
    const scrollParent = container.closest('.workflow-panel');
    const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
    const x1 = elRect.left - containerRect.left + elRect.width / 2;
    const y1 = elRect.top - containerRect.top + scrollTop + elRect.height / 2;
    const x2 = realRect.left - containerRect.left + realRect.width / 2;
    const y2 = realRect.top - containerRect.top + scrollTop + realRect.height / 2;

    // Cubic bezier curving outward for a clean arc
    const dx = Math.abs(x2 - x1) * 0.5;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#4a9eff30');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(path);
  });
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
