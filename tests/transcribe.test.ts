import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowManager, type WorkflowAction } from '../src/workflow.js';
import { classifyIntent } from '../src/intentClassifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ─────────────────────────────────────────────────────────

function loadTranscribeWorkflow(mgr: WorkflowManager): void {
  const jsonl = readFileSync(resolve(__dirname, '../data/workflows.jsonl'), 'utf-8');
  mgr.loadFromJSONL(jsonl);
}

function inputWithClassifier(mgr: WorkflowManager, text: string) {
  const { intent } = classifyIntent(text);
  return mgr.handleInput(text, intent);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Transcribe workflow (end-to-end)', () => {
  let mgr: WorkflowManager;

  beforeEach(() => {
    mgr = new WorkflowManager();
    loadTranscribeWorkflow(mgr);
  });

  it('detects "transcribe mode" as transcribe intent and enters confirm state', () => {
    const { intent } = classifyIntent('transcribe mode');
    expect(intent).toBe('transcribe');

    const result = mgr.handleInput('transcribe mode', intent);
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('confirm');
      expect(result.action.message).toBe('Do you want to transcribe audio?');
    }
  });

  it('"yes" in confirm state transitions to recording state', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    const result = inputWithClassifier(mgr, 'yes');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('recording');
      expect(result.action.message).toContain('Recording');
    }
  });

  it('"hello world" in recording state accumulates to buffer', () => {
    inputWithClassifier(mgr, 'transcribe mode');
    inputWithClassifier(mgr, 'yes');

    const result = mgr.handleInput('hello world', 'unknown');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('input-captured');
    expect(mgr.getContext().buffer).toBe('hello world');
  });

  it('multiple inputs in recording accumulate space-separated', () => {
    inputWithClassifier(mgr, 'transcribe mode');
    inputWithClassifier(mgr, 'yes');

    mgr.handleInput('hello world', 'unknown');
    mgr.handleInput('more text', 'unknown');

    expect(mgr.getContext().buffer).toBe('hello world more text');
  });

  it('"stop transcribe" exits with word count message', () => {
    inputWithClassifier(mgr, 'transcribe mode');
    inputWithClassifier(mgr, 'yes');
    mgr.handleInput('hello world', 'unknown');
    mgr.handleInput('more text', 'unknown');

    const events: WorkflowAction[] = [];
    mgr.on('exit-workflow', a => events.push(a));

    const result = inputWithClassifier(mgr, 'stop transcribe');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Transcript locked. 4 words captured.');
    }
    expect(mgr.isActive()).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('"no" in confirm state exits with cancel message (per-exit message)', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    const result = inputWithClassifier(mgr, 'no');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Cancelled. No transcription started.');
    }
    expect(mgr.isActive()).toBe(false);
  });

  it('random input in confirm state self-loops with reprompt message', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    const result = mgr.handleInput('random stuff', 'unknown');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('confirm');
      expect(result.action.message).toBe("Sorry, I didn't understand. Do you want to transcribe? Say yes or no.");
    }
    expect(mgr.isActive()).toBe(true);
  });

  it('exits after exceeding maxTurns retries', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    // 3 unknowns (maxTurns=3) — self-loops
    mgr.handleInput('potato', 'unknown');
    mgr.handleInput('banana', 'unknown');
    mgr.handleInput('carrot', 'unknown');

    // 4th unknown — exceeds maxTurns, auto-exits
    const result = mgr.handleInput('turnip', 'unknown');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe("Sorry, I couldn't understand. Cancelling transcription.");
    }
    expect(mgr.isActive()).toBe(false);
  });

  it('accepts confirm after wildcard retries', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    // 2 unknowns — self-loops
    mgr.handleInput('potato', 'unknown');
    mgr.handleInput('banana', 'unknown');

    // Then say "yes" — should proceed to recording
    const result = inputWithClassifier(mgr, 'yes');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('recording');
    }
  });

  it('accepts deny after wildcard retries', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    // 1 unknown — self-loop
    mgr.handleInput('potato', 'unknown');

    // Then say "no" — should exit with cancel message
    const result = inputWithClassifier(mgr, 'no');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Cancelled. No transcription started.');
    }
    expect(mgr.isActive()).toBe(false);
  });

  it('after exit, handleInput returns consumed=false (normal pipeline resumes)', () => {
    inputWithClassifier(mgr, 'transcribe mode');
    inputWithClassifier(mgr, 'no'); // exit

    const result = mgr.handleInput('tell me a joke', 'question');
    expect(result.consumed).toBe(false);
  });

  it('full flow: trigger → confirm → record → record → exit', () => {
    // Trigger
    const r1 = inputWithClassifier(mgr, 'start transcribing');
    expect(r1.action?.type).toBe('enter-state');

    // Confirm
    const r2 = inputWithClassifier(mgr, 'go ahead');
    expect(r2.action?.type).toBe('enter-state');
    if (r2.action?.type === 'enter-state') {
      expect(r2.action.stateId).toBe('recording');
    }

    // Record
    mgr.handleInput('The quick brown fox', 'unknown');
    mgr.handleInput('jumped over the lazy dog', 'unknown');
    expect(mgr.getContext().buffer).toBe('The quick brown fox jumped over the lazy dog');

    // Exit
    const r3 = inputWithClassifier(mgr, 'stop transcription');
    expect(r3.action?.type).toBe('exit-workflow');
    if (r3.action?.type === 'exit-workflow') {
      expect(r3.action.message).toBe('Transcript locked. 9 words captured.');
      expect(r3.action.context.buffer).toBe('The quick brown fox jumped over the lazy dog');
    }

    // Pipeline resumes
    const r4 = mgr.handleInput('hello', 'greeting');
    expect(r4.consumed).toBe(false);
  });

  it('exit phrase works from confirm state too', () => {
    inputWithClassifier(mgr, 'transcribe mode');

    const result = inputWithClassifier(mgr, 'stop transcribe');
    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    expect(mgr.isActive()).toBe(false);
  });

  it('classifier correctly identifies workflow-relevant intents', () => {
    expect(classifyIntent('transcribe mode').intent).toBe('transcribe');
    expect(classifyIntent('start transcribing').intent).toBe('transcribe');
    expect(classifyIntent('yes').intent).toBe('confirm');
    expect(classifyIntent('go ahead').intent).toBe('confirm');
    expect(classifyIntent('no').intent).toBe('deny');
    expect(classifyIntent('cancel').intent).toBe('deny');
    expect(classifyIntent('stop').intent).toBe('stop');
  });
});
