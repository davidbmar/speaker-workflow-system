/**
 * stateHighlight.ts — Workflow map node highlighting (active, visited, exit).
 */

import type { AppState, DomRefs } from './appContext.js';

export function highlightState(stateId: string | null, state: AppState, dom: DomRefs): void {
  document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('active'));

  if (stateId === null) {
    document.querySelector('[data-node="idle"]')?.classList.add('active');
    dom.modeBadge.textContent = 'IDLE';
    dom.modeBadge.classList.remove('active');
  } else {
    document.querySelectorAll(`[data-node="${stateId}"]`).forEach(n => n.classList.add('active'));
    state.visitedStates.add(stateId);
    for (const v of state.visitedStates) {
      document.querySelectorAll(`[data-node="${v}"]`).forEach(el => {
        if (!el.classList.contains('active')) el.classList.add('visited');
      });
    }
    if (state.currentDef?.ui) {
      dom.modeBadge.textContent = state.currentDef.ui.indicatorLabel;
      dom.modeBadge.classList.add('active');
    }
  }
}

export function findExitNodeId(state: AppState): string {
  // Most specific: state + intent (branch exit nodes like exit-double_check-deny)
  const composite = `exit-${state.lastActiveStateId}-${state.lastClassifiedIntent}`;
  if (document.querySelector(`[data-node="${composite}"]`)) return composite;
  // By intent (initial state branch exits like exit-deny)
  const byIntent = `exit-${state.lastClassifiedIntent}`;
  if (document.querySelector(`[data-node="${byIntent}"]`)) return byIntent;
  // By state (terminal state exits like exit-recording)
  const byState = `exit-${state.lastActiveStateId}`;
  if (document.querySelector(`[data-node="${byState}"]`)) return byState;
  return 'exit';
}

export function highlightExit(state: AppState, dom: DomRefs): void {
  const exitId = findExitNodeId(state);
  document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('active'));
  document.querySelectorAll(`[data-node="${exitId}"]`).forEach(n => n.classList.add('active'));
  setTimeout(() => {
    state.visitedStates.clear();
    document.querySelectorAll('.wf-node.visited').forEach(n => n.classList.remove('visited'));
    highlightState(null, state, dom);
  }, 2000);
}
