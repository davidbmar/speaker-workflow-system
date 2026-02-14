/**
 * interaction.ts — UI helper functions for messages, buffer display, and event log.
 */

import type { DomRefs } from './appContext.js';
import type { WorkflowContext } from './workflowHandlers.js';

export function addMessage(text: string, type: 'system' | 'user', dom: DomRefs): void {
  const div = document.createElement('div');
  div.className = `msg-bubble ${type}`;
  div.textContent = text;
  dom.messagesEl.appendChild(div);
  dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
}

export function updateBuffer(ctx: Readonly<WorkflowContext>, dom: DomRefs): void {
  dom.bufferDisplay.textContent = ctx.buffer || '';
  const wc = ctx.buffer.trim() ? ctx.buffer.trim().split(/\s+/).length : 0;
  dom.wordVal.textContent = String(wc);
}

export function appendLog(type: string, text: string, dom: DomRefs): void {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = time;
  const eventSpan = document.createElement('span');
  eventSpan.className = `log-event type-${type}`;
  eventSpan.textContent = text;
  entry.appendChild(timeSpan);
  entry.appendChild(eventSpan);
  dom.eventLog.appendChild(entry);
  dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
}
