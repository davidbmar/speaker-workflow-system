/**
 * Named handler registry for workflow states.
 * Each handler receives freeform input text and mutates the workflow context.
 */

export interface WorkflowContext {
  buffer: string;
  metadata: Record<string, unknown>;
  turnCount: number;
  stateTurnCount: number;
}

export type WorkflowHandler = (text: string, ctx: WorkflowContext) => void;

export const WORKFLOW_HANDLERS: Record<string, WorkflowHandler> = {
  /**
   * Appends text to buffer, space-separated.
   * Used by transcribe mode to accumulate speech.
   */
  accumulate: (text: string, ctx: WorkflowContext) => {
    ctx.buffer += (ctx.buffer ? ' ' : '') + text;
  },

  /**
   * Appends text as a bullet point, newline-separated.
   * Useful for list-building workflows.
   */
  bullets: (text: string, ctx: WorkflowContext) => {
    ctx.buffer += (ctx.buffer ? '\n' : '') + '- ' + text;
  },
};
