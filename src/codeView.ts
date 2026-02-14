/**
 * codeView.ts — Generates a color-coded pseudocode DOM from a WorkflowDef.
 *
 * Each state becomes a clickable `.code-block` with `data-code-for="stateId"`.
 * Each transition line gets `data-code-arrow="stateId:intent"` for arrow linking.
 */

import type { WorkflowDef, WorkflowStateDef } from './workflow.js';

// ── Helpers ──────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function kw(text: string): string {
  return `<span class="code-keyword">${text}</span>`;
}

function str(text: string): string {
  return `<span class="code-string">"${escHtml(text)}"</span>`;
}

function intent(text: string): string {
  return `<span class="code-intent">${escHtml(text)}</span>`;
}

function stateRef(text: string): string {
  return `<span class="code-state-ref">${escHtml(text.toUpperCase())}</span>`;
}

function arrow(): string {
  return `<span class="code-arrow">\u2192</span>`;
}

// ── Transition line renderer ─────────────────────────────────────────

function renderTransitionLine(stateId: string, intentName: string, target: string): string {
  const colonIdx = target.indexOf(':');
  const isExit = target === 'exit' || target.startsWith('exit:');
  const isSelfLoop = target === stateId || (colonIdx !== -1 && target.slice(0, colonIdx) === stateId);

  let action: string;
  if (isExit) {
    const msg = target.startsWith('exit:') ? target.slice(5) : '';
    action = msg ? `${kw('exit')} ${str(msg)}` : kw('exit');
  } else if (isSelfLoop) {
    const msg = colonIdx !== -1 ? target.slice(colonIdx + 1) : '';
    action = msg ? `${kw('retry')} ${str(msg)}` : kw('retry');
  } else {
    const targetState = colonIdx !== -1 ? target.slice(0, colonIdx) : target;
    const msg = colonIdx !== -1 ? target.slice(colonIdx + 1) : '';
    action = msg
      ? `${kw('goto')} ${stateRef(targetState)} ${str(msg)}`
      : `${kw('goto')} ${stateRef(targetState)}`;
  }

  return `<div class="code-line" data-code-arrow="${escHtml(stateId)}:${escHtml(intentName)}">${kw('on')} ${intent(intentName)} ${arrow()} ${action}</div>`;
}

// ── State block renderer ─────────────────────────────────────────────

function renderStateBlock(state: WorkflowStateDef): string {
  const lines: string[] = [];

  // say "..."
  lines.push(`<div class="code-line">${kw('say')} ${str(state.onEnter)}</div>`);

  // capture: handler
  if (state.handler) {
    lines.push(`<div class="code-line">${kw('capture:')} ${escHtml(state.handler)}</div>`);
  }

  // max N turns → exit/goto "..."
  if (state.maxTurns != null) {
    const target = state.maxTurnsTarget ?? 'exit';
    const isExit = target === 'exit' || target.startsWith('exit:');
    const msg = target.startsWith('exit:') ? target.slice(5) : '';
    const action = isExit
      ? (msg ? `${kw('exit')} ${str(msg)}` : kw('exit'))
      : `${kw('goto')} ${stateRef(target)}`;
    lines.push(`<div class="code-line">${kw('max')} ${state.maxTurns} turns ${arrow()} ${action}</div>`);
  }

  // Transitions
  for (const [intentName, target] of Object.entries(state.transitions)) {
    lines.push(renderTransitionLine(state.id, intentName, target));
  }

  return lines.join('\n');
}

// ── Main renderer ────────────────────────────────────────────────────

export function renderCodeView(
  def: WorkflowDef,
  container: HTMLElement,
  onClickBlock: (nodeId: string) => void
): void {
  container.innerHTML = '';

  // Workflow header block
  const headerBlock = document.createElement('div');
  headerBlock.className = 'code-block';
  headerBlock.dataset.codeFor = '__workflow__';
  const exitList = def.exitPhrases.slice(0, 3).map(p => `"${escHtml(p)}"`).join(', ');
  const exitEllipsis = def.exitPhrases.length > 3 ? ', ...' : '';
  headerBlock.innerHTML = `
    <div class="code-line">${kw('workflow')} ${str(def.id)}</div>
    <div class="code-indent">
      <div class="code-line">${kw('trigger:')} ${intent(def.triggerIntent)}</div>
      <div class="code-line">${kw('exit on:')} ${exitList}${exitEllipsis}</div>
      <div class="code-line">${kw('exit says:')} ${str(def.exitMessage)}</div>
    </div>
  `;
  headerBlock.addEventListener('click', () => onClickBlock('idle'));
  container.appendChild(headerBlock);

  // State blocks — render in order starting from initialState
  const rendered = new Set<string>();
  const queue = [def.initialState];

  while (queue.length > 0) {
    const stateId = queue.shift()!;
    if (rendered.has(stateId)) continue;
    rendered.add(stateId);

    const state = def.states[stateId];
    if (!state) continue;

    const block = document.createElement('div');
    block.className = 'code-block';
    block.dataset.codeFor = stateId;
    block.innerHTML = `
      <div class="code-line code-state-header">${kw('state')} ${stateRef(stateId)}</div>
      <div class="code-indent">
        ${renderStateBlock(state)}
      </div>
    `;
    block.addEventListener('click', () => onClickBlock(stateId));
    container.appendChild(block);

    // Queue reachable states
    for (const target of Object.values(state.transitions)) {
      const colonIdx = target.indexOf(':');
      const targetId = colonIdx !== -1 ? target.slice(0, colonIdx) : target;
      if (targetId !== 'exit' && def.states[targetId] && !rendered.has(targetId)) {
        queue.push(targetId);
      }
    }
  }

  // Render any remaining states not reachable from initial
  for (const stateId of Object.keys(def.states)) {
    if (rendered.has(stateId)) continue;
    rendered.add(stateId);
    const state = def.states[stateId];
    const block = document.createElement('div');
    block.className = 'code-block';
    block.dataset.codeFor = stateId;
    block.innerHTML = `
      <div class="code-line code-state-header">${kw('state')} ${stateRef(stateId)}</div>
      <div class="code-indent">
        ${renderStateBlock(state)}
      </div>
    `;
    block.addEventListener('click', () => onClickBlock(stateId));
    container.appendChild(block);
  }
}
