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
    document.querySelector(`[data-node="${stateId}"]`)?.classList.add('active');
    state.visitedStates.add(stateId);
    for (const v of state.visitedStates) {
      const el = document.querySelector(`[data-node="${v}"]`);
      if (el && !el.classList.contains('active')) el.classList.add('visited');
    }
    if (state.currentDef?.ui) {
      dom.modeBadge.textContent = state.currentDef.ui.indicatorLabel;
      dom.modeBadge.classList.add('active');
    }
  }
}

export function findExitNodeId(state: AppState): string {
  const byIntent = document.querySelector(`[data-node="exit-${state.lastClassifiedIntent}"]`);
  if (byIntent) return `exit-${state.lastClassifiedIntent}`;
  const byState = document.querySelector(`[data-node="exit-${state.lastActiveStateId}"]`);
  if (byState) return `exit-${state.lastActiveStateId}`;
  return 'exit';
}

export function highlightExit(state: AppState, dom: DomRefs): void {
  const exitId = findExitNodeId(state);
  document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-node="${exitId}"]`)?.classList.add('active');
  setTimeout(() => {
    state.visitedStates.clear();
    document.querySelectorAll('.wf-node.visited').forEach(n => n.classList.remove('visited'));
    highlightState(null, state, dom);
  }, 2000);
}
