/**
 * domUtils.ts — Pure utility functions shared across UI modules.
 */

import { INTENT_SIGNALS } from './intentClassifier.js';

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

export function isSelfLoopTransition(target: string, stateId: string): boolean {
  if (target === stateId) return true;
  const colonIdx = target.indexOf(':');
  if (colonIdx !== -1 && target.slice(0, colonIdx) === stateId) return true;
  return false;
}

/** Get display keywords for an intent (first 4 from classifier signals). */
export function getKeywords(intent: string): string[] {
  return (INTENT_SIGNALS[intent] ?? []).slice(0, 4);
}
