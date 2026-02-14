/**
 * renameState.ts — Rename a state ID across an entire workflow definition.
 * Pure function: mutates the def in-place, no DOM dependency.
 */

import type { WorkflowDef } from './workflow.js';

export function renameState(def: WorkflowDef, oldId: string, newId: string): void {
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
