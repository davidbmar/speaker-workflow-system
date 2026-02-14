/**
 * Minimal keyword-based intent classifier.
 * Extracted from web-app stateGate.ts — only the intents needed for workflow transitions.
 */

export interface ClassifyResult {
  intent: string;
  score: number;
}

// ── Keyword lists (subset for workflow transitions) ──────────────────

export const INTENT_SIGNALS: Record<string, string[]> = {
  transcribe: [
    'transcribe', 'transcription', 'dictate', 'dictation',
    'transcribe mode', 'start transcribing', 'take dictation',
  ],
  confirm: [
    'yes', 'go ahead', 'do it', 'confirmed', 'approved', 'proceed',
    'affirmative', 'sure', 'ok do it', 'green light', 'go for it',
  ],
  deny: [
    'no', "don't", 'cancel', 'forget it', 'never mind', 'stop that',
    'negative', 'abort that', 'scratch that', 'nope',
  ],
  stop: [
    'stop', 'end', 'terminate', 'halt', 'quit', 'shut up', 'shut down',
    'cancel', 'abort', 'enough', 'stop talking', 'be quiet', 'silence',
  ],
};

// ── Priority tiebreaker ──────────────────────────────────────────────
// Higher = wins ties. System actions beat broad intents.

const INTENT_PRIORITY: Record<string, number> = {
  transcribe: 3,
  confirm: 3,
  deny: 3,
  stop: 3,
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Count how many signals appear in input.
 * Short signals (<=3 chars) use word-boundary matching to avoid
 * false positives like "no" in "nothing".
 */
function countMatches(input: string, signals: string[]): number {
  let count = 0;
  for (const sig of signals) {
    if (sig.length <= 3) {
      const re = new RegExp(`\\b${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(input)) count++;
    } else {
      if (input.includes(sig)) count++;
    }
  }
  return count;
}

// ── Main classifier ─────────────────────────────────────────────────

export function classifyIntent(text: string): ClassifyResult {
  const lower = text.toLowerCase().trim();

  let bestIntent = 'unknown';
  let maxScore = 0;
  let bestPriority = 0;

  for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
    const score = countMatches(lower, signals);
    const pri = INTENT_PRIORITY[intent] ?? 2;

    if (score > maxScore || (score === maxScore && score > 0 && pri > bestPriority)) {
      maxScore = score;
      bestIntent = intent;
      bestPriority = pri;
    }
  }

  return { intent: bestIntent, score: maxScore };
}
