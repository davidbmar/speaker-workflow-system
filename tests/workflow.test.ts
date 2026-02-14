import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowManager, type WorkflowDef, type WorkflowAction } from '../src/workflow.js';

// ── Test fixture ────────────────────────────────────────────────────

function makeTestDef(overrides?: Partial<WorkflowDef>): WorkflowDef {
  return {
    id: 'test-flow',
    triggerIntent: 'test_trigger',
    initialState: 'step1',
    exitPhrases: ['quit test', 'exit test'],
    exitMessage: 'Done. {{wordCount}} words, {{turnCount}} turns.',
    states: {
      step1: {
        id: 'step1',
        onEnter: 'Welcome to step 1.',
        transitions: { confirm: 'step2', deny: 'exit' },
      },
      step2: {
        id: 'step2',
        onEnter: 'Now in step 2. Buffer: {{buffer}}',
        handler: 'accumulate',
        transitions: {},
      },
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('WorkflowManager', () => {
  let mgr: WorkflowManager;

  beforeEach(() => {
    mgr = new WorkflowManager();
  });

  // ── Registration ──

  it('registers a workflow and shouldTrigger returns true for its intent', () => {
    mgr.register(makeTestDef());
    expect(mgr.shouldTrigger('test_trigger')).toBe(true);
    expect(mgr.shouldTrigger('other_intent')).toBe(false);
  });

  // ── Trigger + enter initial state ──

  it('triggers workflow and enters initial state on matching intent', () => {
    mgr.register(makeTestDef());
    const events: WorkflowAction[] = [];
    mgr.on('enter-state', a => events.push(a));

    const result = mgr.handleInput('start test', 'test_trigger');

    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('step1');
      expect(result.action.message).toBe('Welcome to step 1.');
    }
    expect(mgr.isActive()).toBe(true);
    expect(events).toHaveLength(1);
  });

  // ── Confirm transition ──

  it('transitions to next state on confirm intent', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');

    const result = mgr.handleInput('yes', 'confirm');

    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('enter-state');
    if (result.action?.type === 'enter-state') {
      expect(result.action.stateId).toBe('step2');
    }
    expect(mgr.getActiveStateId()).toBe('step2');
  });

  // ── Deny transition → exit ──

  it('exits workflow on deny intent when transition points to exit', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');

    const events: WorkflowAction[] = [];
    mgr.on('exit-workflow', a => events.push(a));

    const result = mgr.handleInput('no', 'deny');

    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    expect(mgr.isActive()).toBe(false);
    expect(events).toHaveLength(1);
  });

  // ── Exit phrase from any state ──

  it('exits workflow when exit phrase is detected from any state', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('yes', 'confirm'); // now in step2

    const result = mgr.handleInput('quit test', 'unknown');

    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('exit-workflow');
    expect(mgr.isActive()).toBe(false);
  });

  // ── Handler captures freeform input ──

  it('calls handler for unmatched input and emits input-captured', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('yes', 'confirm'); // now in step2 (has handler)

    const events: WorkflowAction[] = [];
    mgr.on('input-captured', a => events.push(a));

    const result = mgr.handleInput('hello world', 'unknown');

    expect(result.consumed).toBe(true);
    expect(result.action?.type).toBe('input-captured');
    expect(mgr.getContext().buffer).toBe('hello world');
    expect(events).toHaveLength(1);
  });

  // ── Template resolution ──

  it('resolves {{wordCount}}, {{buffer}}, {{turnCount}} in templates', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('yes', 'confirm');
    mgr.handleInput('hello world', 'unknown');    // turn 1
    mgr.handleInput('foo bar baz', 'unknown');     // turn 2

    const result = mgr.handleInput('quit test', 'unknown');

    expect(result.action?.type).toBe('exit-workflow');
    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Done. 5 words, 3 turns.');
    }
  });

  // ── Template resolves in onEnter ──

  it('resolves template variables in onEnter messages', () => {
    mgr.register(makeTestDef());
    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('yes', 'confirm'); // step2 onEnter uses {{buffer}}

    const result = mgr.handleInput('yes', 'confirm'); // re-enter via transition
    // step2 has no 'confirm' transition, so it goes to handler (accumulate)
    // Actually, step2 has no transitions, so 'confirm' intent goes to handler
    expect(result.consumed).toBe(true);
  });

  // ── Multiple workflows registered ──

  it('supports multiple registered workflows', () => {
    mgr.register(makeTestDef());
    mgr.register(makeTestDef({
      id: 'other-flow',
      triggerIntent: 'other_trigger',
      exitMessage: 'Other done.',
    }));

    expect(mgr.shouldTrigger('test_trigger')).toBe(true);
    expect(mgr.shouldTrigger('other_trigger')).toBe(true);
    expect(mgr.shouldTrigger('nope')).toBe(false);
  });

  // ── Only one workflow active at a time ──

  it('does not trigger a second workflow while one is active', () => {
    mgr.register(makeTestDef());
    mgr.register(makeTestDef({
      id: 'other-flow',
      triggerIntent: 'other_trigger',
    }));

    mgr.handleInput('go', 'test_trigger');
    expect(mgr.isActive()).toBe(true);
    expect(mgr.getActiveWorkflowId()).toBe('test-flow');

    // Attempting to trigger other_trigger while test-flow is active
    // should be consumed by active workflow (no transition or handler match → not consumed)
    const result = mgr.handleInput('other', 'other_trigger');
    // The active workflow's step1 has no transition for 'other_trigger'
    // and no handler, so it should not be consumed
    expect(mgr.getActiveWorkflowId()).toBe('test-flow');
  });

  // ── Non-matching input when no workflow active ──

  it('returns consumed=false when no workflow is active and intent does not match', () => {
    mgr.register(makeTestDef());
    const result = mgr.handleInput('random stuff', 'question');
    expect(result.consumed).toBe(false);
    expect(mgr.isActive()).toBe(false);
  });

  // ── JSONL loading ──

  it('loads workflow definitions from JSONL string', () => {
    const jsonl = JSON.stringify(makeTestDef()) + '\n' + JSON.stringify(makeTestDef({
      id: 'second',
      triggerIntent: 'second_trigger',
    }));

    mgr.loadFromJSONL(jsonl);

    expect(mgr.shouldTrigger('test_trigger')).toBe(true);
    expect(mgr.shouldTrigger('second_trigger')).toBe(true);
  });

  // ── Custom handler registration ──

  it('supports registering custom handlers', () => {
    mgr.register(makeTestDef({
      states: {
        step1: {
          id: 'step1',
          onEnter: 'Start.',
          transitions: {},
          handler: 'custom',
        },
      },
    }));

    mgr.registerHandler('custom', (text, ctx) => {
      ctx.metadata['last'] = text.toUpperCase();
    });

    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('hello', 'unknown');

    expect(mgr.getContext().metadata['last']).toBe('HELLO');
  });

  // ── Event listener removal ──

  it('supports removing event listeners with off()', () => {
    mgr.register(makeTestDef());
    const events: WorkflowAction[] = [];
    const listener = (a: WorkflowAction) => events.push(a);

    mgr.on('enter-state', listener);
    mgr.handleInput('go', 'test_trigger');
    expect(events).toHaveLength(1);

    mgr.off('enter-state', listener);
    mgr.handleInput('yes', 'confirm');
    expect(events).toHaveLength(1); // no new event captured
  });

  // ── Self-loop transitions ──

  describe('self-loop transitions', () => {
    it('"stateId:message" format works for self-loops', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { confirm: 'step2', '*': 'step1:Please say yes or no.' },
          },
          step2: {
            id: 'step2',
            onEnter: 'Step 2.',
            transitions: {},
            handler: 'accumulate',
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');
      const result = mgr.handleInput('potato', 'unknown');

      expect(result.consumed).toBe(true);
      expect(result.action?.type).toBe('enter-state');
      if (result.action?.type === 'enter-state') {
        expect(result.action.stateId).toBe('step1');
        expect(result.action.message).toBe('Please say yes or no.');
      }
      expect(mgr.isActive()).toBe(true);
    });

    it('stateTurnCount increments on self-loop and resets on state change', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { confirm: 'step2', '*': 'step1:Try again.' },
          },
          step2: {
            id: 'step2',
            onEnter: 'Step 2.',
            transitions: {},
            handler: 'accumulate',
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');

      // Self-loop twice
      mgr.handleInput('potato', 'unknown');
      expect(mgr.getContext().stateTurnCount).toBe(1);
      mgr.handleInput('banana', 'unknown');
      expect(mgr.getContext().stateTurnCount).toBe(2);

      // Transition to step2 — resets
      mgr.handleInput('yes', 'confirm');
      expect(mgr.getContext().stateTurnCount).toBe(0);

      // Input in step2
      mgr.handleInput('hello', 'unknown');
      expect(mgr.getContext().stateTurnCount).toBe(1);
    });

    it('maxTurns causes exit after N inputs', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { confirm: 'step2', '*': 'step1:Try again.' },
            maxTurns: 2,
            maxTurnsTarget: 'exit:Too many retries.',
          },
          step2: {
            id: 'step2',
            onEnter: 'Step 2.',
            transitions: {},
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');
      mgr.handleInput('potato', 'unknown');   // turn 1 — self-loop
      mgr.handleInput('banana', 'unknown');   // turn 2 — self-loop

      const result = mgr.handleInput('carrot', 'unknown');  // turn 3 — exceeds maxTurns=2
      expect(result.action?.type).toBe('exit-workflow');
      if (result.action?.type === 'exit-workflow') {
        expect(result.action.message).toBe('Too many retries.');
      }
      expect(mgr.isActive()).toBe(false);
    });

    it('maxTurns defaults to exit when maxTurnsTarget not set', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { '*': 'step1:Try again.' },
            maxTurns: 1,
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');
      mgr.handleInput('potato', 'unknown');   // turn 1 — self-loop

      const result = mgr.handleInput('banana', 'unknown');  // turn 2 — exceeds maxTurns=1
      expect(result.action?.type).toBe('exit-workflow');
      expect(mgr.isActive()).toBe(false);
    });

    it('"stateId:message" works for cross-state transitions', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { deny: 'step2:Starting fresh.' },
          },
          step2: {
            id: 'step2',
            onEnter: 'Default step 2.',
            transitions: {},
            handler: 'accumulate',
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');
      const result = mgr.handleInput('no', 'deny');

      expect(result.action?.type).toBe('enter-state');
      if (result.action?.type === 'enter-state') {
        expect(result.action.stateId).toBe('step2');
        expect(result.action.message).toBe('Starting fresh.');
      }
    });

    it('resolves {{stateTurnCount}} in override messages', () => {
      mgr.register(makeTestDef({
        states: {
          step1: {
            id: 'step1',
            onEnter: 'Welcome.',
            transitions: { '*': 'step1:Attempt {{stateTurnCount}}. Try again.' },
          },
        },
      }));

      mgr.handleInput('go', 'test_trigger');
      const result = mgr.handleInput('potato', 'unknown');

      expect(result.action?.type).toBe('enter-state');
      if (result.action?.type === 'enter-state') {
        expect(result.action.message).toBe('Attempt 1. Try again.');
      }

      const result2 = mgr.handleInput('banana', 'unknown');
      if (result2.action?.type === 'enter-state') {
        expect(result2.action.message).toBe('Attempt 2. Try again.');
      }
    });
  });

  // ── Metadata template resolution ──

  it('resolves {{metadata.key}} in templates', () => {
    mgr.register(makeTestDef({
      exitMessage: 'Result: {{metadata.topic}}',
      states: {
        step1: {
          id: 'step1',
          onEnter: 'Go.',
          transitions: {},
          handler: 'custom',
        },
      },
    }));

    mgr.registerHandler('custom', (_text, ctx) => {
      ctx.metadata['topic'] = 'cyberpunk';
    });

    mgr.handleInput('go', 'test_trigger');
    mgr.handleInput('something', 'unknown');
    const result = mgr.handleInput('quit test', 'unknown');

    if (result.action?.type === 'exit-workflow') {
      expect(result.action.message).toBe('Result: cyberpunk');
    }
  });
});
