import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowManager, type WorkflowDef, type WorkflowAction } from '../src/workflow.js';
import { classifyIntent, INTENT_SIGNALS } from '../src/intentClassifier.js';
import {
  parseTransitions,
  serializeTransitions,
  parseExitPhrases,
  parseExitPhrasesNewline,
  parseKeywords,
} from '../src/editorUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ─────────────────────────────────────────────────────────

function loadDef(): WorkflowDef {
  const jsonl = readFileSync(resolve(__dirname, '../data/workflows.jsonl'), 'utf-8');
  const line = jsonl.split('\n').filter(l => l.trim())[0];
  return JSON.parse(line) as WorkflowDef;
}

function loadMgr(): WorkflowManager {
  const mgr = new WorkflowManager();
  const jsonl = readFileSync(resolve(__dirname, '../data/workflows.jsonl'), 'utf-8');
  mgr.loadFromJSONL(jsonl);
  return mgr;
}

/** Simulate the edit cycle: serialize → parse → apply → re-register. */
function editStateTransitions(
  def: WorkflowDef,
  stateId: string,
  edit: (text: string) => string,
): void {
  const state = def.states[stateId];
  const serialized = serializeTransitions(state.transitions);
  const edited = edit(serialized);
  state.transitions = parseTransitions(edited);
}

// ── Transition parsing ──────────────────────────────────────────────

describe('transition parsing', () => {
  it('parses simple "confirm → recording"', () => {
    const result = parseTransitions('confirm → recording');
    expect(result).toEqual({ confirm: 'recording' });
  });

  it('parses plain exit "deny → exit"', () => {
    const result = parseTransitions('deny → exit');
    expect(result).toEqual({ deny: 'exit' });
  });

  it('parses exit with message "deny → exit:Cancelled. No transcription started."', () => {
    const result = parseTransitions('deny → exit:Cancelled. No transcription started.');
    expect(result).toEqual({ deny: 'exit:Cancelled. No transcription started.' });
  });

  it('parses self-loop with long message', () => {
    const result = parseTransitions(
      "* → confirm:Sorry, I didn't understand. Do you want to transcribe? Say yes or no."
    );
    expect(result).toEqual({
      '*': "confirm:Sorry, I didn't understand. Do you want to transcribe? Say yes or no.",
    });
  });

  it('parses cross-state with message "deny → recording:Starting fresh."', () => {
    const result = parseTransitions('deny → recording:Starting fresh.');
    expect(result).toEqual({ deny: 'recording:Starting fresh.' });
  });

  it('parses multiple transitions', () => {
    const text = [
      'confirm → recording',
      'deny → exit:Cancelled. No transcription started.',
      "* → confirm:Sorry, I didn't understand. Do you want to transcribe? Say yes or no.",
    ].join('\n');
    const result = parseTransitions(text);
    expect(result).toEqual({
      confirm: 'recording',
      deny: 'exit:Cancelled. No transcription started.',
      '*': "confirm:Sorry, I didn't understand. Do you want to transcribe? Say yes or no.",
    });
  });

  it('handles empty lines and whitespace', () => {
    const text = '\n  confirm → recording  \n\n  deny → exit  \n\n';
    const result = parseTransitions(text);
    expect(result).toEqual({ confirm: 'recording', deny: 'exit' });
  });

  it('handles -> as arrow alternative', () => {
    const result = parseTransitions('confirm -> recording\ndeny -> exit');
    expect(result).toEqual({ confirm: 'recording', deny: 'exit' });
  });

  it('ignores malformed lines', () => {
    const text = 'confirm → recording\nthis is garbage\ndeny → exit';
    const result = parseTransitions(text);
    expect(result).toEqual({ confirm: 'recording', deny: 'exit' });
  });

  it('round-trip: serialize then parse preserves all confirm-state transitions', () => {
    const def = loadDef();
    const original = def.states['confirm'].transitions;
    const serialized = serializeTransitions(original);
    const parsed = parseTransitions(serialized);
    expect(parsed).toEqual(original);
  });

  it('round-trip: serialize then parse preserves recording-state transitions', () => {
    const def = loadDef();
    const original = def.states['recording'].transitions;
    const serialized = serializeTransitions(original);
    const parsed = parseTransitions(serialized);
    expect(parsed).toEqual(original);
  });
});

// ── Exit phrase parsing ─────────────────────────────────────────────

describe('exit phrase parsing', () => {
  it('parses comma-separated phrases (state editor format)', () => {
    const result = parseExitPhrases('stop transcribe, stop transcription, end dictation');
    expect(result).toEqual(['stop transcribe', 'stop transcription', 'end dictation']);
  });

  it('parses newline-separated phrases (arrow editor format)', () => {
    const result = parseExitPhrasesNewline('stop transcribe\nstop transcription\nend dictation');
    expect(result).toEqual(['stop transcribe', 'stop transcription', 'end dictation']);
  });

  it('filters empty entries', () => {
    expect(parseExitPhrases(', stop, , end, ')).toEqual(['stop', 'end']);
    expect(parseExitPhrasesNewline('\n stop \n\n end \n')).toEqual(['stop', 'end']);
  });
});

// ── Keyword parsing ─────────────────────────────────────────────────

describe('keyword parsing', () => {
  it('parses newline-separated keywords and lowercases them', () => {
    const result = parseKeywords('Yes\nGo Ahead\nDO IT');
    expect(result).toEqual(['yes', 'go ahead', 'do it']);
  });

  it('filters empty lines', () => {
    const result = parseKeywords('\nyes\n\nno\n');
    expect(result).toEqual(['yes', 'no']);
  });
});

// ── State editing round-trips ───────────────────────────────────────

describe('state editing round-trips', () => {
  it('edit idle: changing triggerIntent re-registers workflow', () => {
    const def = loadDef();
    def.triggerIntent = 'dictate';

    const mgr = new WorkflowManager();
    mgr.register(def);

    expect(mgr.shouldTrigger('dictate')).toBe(true);
    expect(mgr.shouldTrigger('transcribe')).toBe(false);

    const result = mgr.handleInput('dictate mode', 'dictate');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
  });

  it('edit confirm state: changing onEnter updates the enter message', () => {
    const def = loadDef();
    def.states['confirm'].onEnter = 'Ready to record. Confirm?';

    const mgr = new WorkflowManager();
    mgr.register(def);
    const result = mgr.handleInput('transcribe mode', 'transcribe');

    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.message).toBe('Ready to record. Confirm?');
    }
  });

  it('edit confirm state: round-trip transitions preserves confirm → recording', () => {
    const def = loadDef();
    editStateTransitions(def, 'confirm', text => text); // no-op edit

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');

    const result = mgr.handleInput('yes', 'confirm');
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('recording');
    }
  });

  it('edit confirm state: round-trip transitions preserves deny → exit with message', () => {
    const def = loadDef();
    editStateTransitions(def, 'confirm', text => text); // no-op edit

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');

    const result = mgr.handleInput('no', 'deny');
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Cancelled. No transcription started.');
    }
  });

  it('edit confirm state: round-trip transitions preserves * → self-loop with message', () => {
    const def = loadDef();
    editStateTransitions(def, 'confirm', text => text); // no-op edit

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');

    const result = mgr.handleInput('potato', 'unknown');
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('confirm');
      expect(result.action.message).toBe(
        "Sorry, I didn't understand. Do you want to transcribe? Say yes or no."
      );
    }
  });

  it('edit confirm state: changing wildcard target from self-loop to exit', () => {
    const def = loadDef();
    editStateTransitions(def, 'confirm', text =>
      text.replace(
        /^\* →.+$/m,
        '* → exit:Unknown input. Goodbye.'
      )
    );

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');

    const result = mgr.handleInput('potato', 'unknown');
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Unknown input. Goodbye.');
    }
  });

  it('edit confirm state: adding a new transition', () => {
    const def = loadDef();
    editStateTransitions(def, 'confirm', text =>
      text + '\nstop → exit:Stopped.'
    );

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');

    const result = mgr.handleInput('stop', 'stop');
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Stopped.');
    }
  });

  it('edit recording state: changing onEnter updates the enter message', () => {
    const def = loadDef();
    def.states['recording'].onEnter = 'Mic hot. Speak now.';

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');
    const result = mgr.handleInput('yes', 'confirm');

    if (result.action?.type === 'enter-state') {
      expect(result.action.message).toBe('Mic hot. Speak now.');
    }
  });

  it('edit recording state: changing handler to bullets changes accumulation', () => {
    const def = loadDef();
    def.states['recording'].handler = 'bullets';

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');
    mgr.handleInput('yes', 'confirm');

    mgr.handleInput('first item', 'unknown');
    mgr.handleInput('second item', 'unknown');

    expect(mgr.getContext().buffer).toBe('- first item\n- second item');
  });

  it('edit exit: changing exitMessage updates word count exit', () => {
    const def = loadDef();
    def.exitMessage = 'Done! {{wordCount}} words saved.';

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');
    mgr.handleInput('yes', 'confirm');
    mgr.handleInput('hello world', 'unknown');

    const result = mgr.handleInput('stop transcribe', 'unknown');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Done! 2 words saved.');
    }
  });

  it('edit exit: changing exitPhrases updates what triggers exit', () => {
    const def = loadDef();
    def.exitPhrases = parseExitPhrases('finish up, all done');

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');
    mgr.handleInput('yes', 'confirm');

    // Old exit phrase should NOT work
    const r1 = mgr.handleInput('stop transcribe', 'unknown');
    expect(r1.action?.type).toBe('input-captured'); // captured by handler, not exit

    // New exit phrase should work
    const r2 = mgr.handleInput('finish up', 'unknown');
    expect(r2.action?.type).toBe('exit-workflow');
  });
});

// ── Trigger keyword editing ─────────────────────────────────────────

describe('trigger keyword editing', () => {
  // Save original signals and restore after each test
  let savedSignals: Record<string, string[]>;

  beforeEach(() => {
    savedSignals = {};
    for (const [k, v] of Object.entries(INTENT_SIGNALS)) {
      savedSignals[k] = [...v];
    }
  });

  afterEach(() => {
    // Restore original signals
    for (const key of Object.keys(INTENT_SIGNALS)) {
      delete INTENT_SIGNALS[key];
    }
    for (const [k, v] of Object.entries(savedSignals)) {
      INTENT_SIGNALS[k] = v;
    }
  });

  it('edit confirm keywords: adding "absolutely" makes it classify as confirm', () => {
    // Before: "absolutely" is unknown
    expect(classifyIntent('absolutely').intent).toBe('unknown');

    // Edit: add keyword
    INTENT_SIGNALS['confirm'] = parseKeywords(
      INTENT_SIGNALS['confirm'].join('\n') + '\nabsolutely'
    );

    // After: "absolutely" classifies as confirm
    expect(classifyIntent('absolutely').intent).toBe('confirm');
  });

  it('edit confirm keywords: removing "yes" stops it from classifying as confirm', () => {
    expect(classifyIntent('yes').intent).toBe('confirm');

    // Edit: remove "yes" from signals
    INTENT_SIGNALS['confirm'] = INTENT_SIGNALS['confirm'].filter(s => s !== 'yes');

    // "yes" alone should no longer classify as confirm
    expect(classifyIntent('yes').intent).not.toBe('confirm');
  });

  it('edit deny keywords: adding "nah" makes it classify as deny', () => {
    expect(classifyIntent('nah').intent).toBe('unknown');

    INTENT_SIGNALS['deny'] = parseKeywords(
      INTENT_SIGNALS['deny'].join('\n') + '\nnah'
    );

    expect(classifyIntent('nah').intent).toBe('deny');
  });

  it('edit deny keywords: removing "no" stops it from classifying as deny', () => {
    expect(classifyIntent('no').intent).toBe('deny');

    INTENT_SIGNALS['deny'] = INTENT_SIGNALS['deny'].filter(s => s !== 'no');

    expect(classifyIntent('no').intent).not.toBe('deny');
  });

  it('edit transcribe keywords: adding "record mode" makes it classify as transcribe', () => {
    expect(classifyIntent('record mode').intent).toBe('unknown');

    INTENT_SIGNALS['transcribe'] = parseKeywords(
      INTENT_SIGNALS['transcribe'].join('\n') + '\nrecord mode'
    );

    expect(classifyIntent('record mode').intent).toBe('transcribe');
  });

  it('edit transcribe keywords: replacing all keywords still works', () => {
    INTENT_SIGNALS['transcribe'] = parseKeywords('record\nrecord mode\nstart recording');

    expect(classifyIntent('record mode').intent).toBe('transcribe');
    expect(classifyIntent('start recording').intent).toBe('transcribe');
    // Old keyword removed
    expect(classifyIntent('transcribe mode').intent).not.toBe('transcribe');
  });

  it('edit stop keywords: adding "finished" makes it classify as stop', () => {
    expect(classifyIntent('finished').intent).toBe('unknown');

    INTENT_SIGNALS['stop'] = parseKeywords(
      INTENT_SIGNALS['stop'].join('\n') + '\nfinished'
    );

    expect(classifyIntent('finished').intent).toBe('stop');
  });

  it('adding a brand new intent works with the classifier', () => {
    INTENT_SIGNALS['pause'] = parseKeywords('pause\nhold on\nwait a moment');

    expect(classifyIntent('pause').intent).toBe('pause');
    expect(classifyIntent('hold on').intent).toBe('pause');
  });

  it('full edit cycle: change keywords then verify workflow behavior', () => {
    // Add "yep" as a confirm keyword
    INTENT_SIGNALS['confirm'] = parseKeywords(
      INTENT_SIGNALS['confirm'].join('\n') + '\nyep'
    );

    const mgr = loadMgr();
    mgr.handleInput('transcribe mode', 'transcribe');

    // "yep" should now trigger confirm → recording
    const { intent } = classifyIntent('yep');
    expect(intent).toBe('confirm');

    const result = mgr.handleInput('yep', intent);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('recording');
    }
  });

  it('exit phrases edited via arrow editor format (newline-separated)', () => {
    const def = loadDef();
    def.exitPhrases = parseExitPhrasesNewline(
      'stop transcribe\nstop transcription\nfinish recording'
    );

    const mgr = new WorkflowManager();
    mgr.register(def);
    mgr.handleInput('transcribe mode', 'transcribe');
    mgr.handleInput('yes', 'confirm');

    // New phrase works
    const result = mgr.handleInput('finish recording', 'unknown');
    expect(result.action?.type).toBe('exit-workflow');
  });
});
