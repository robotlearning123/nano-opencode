/**
 * Built-in Hooks - consolidated hook implementations
 */

import type { Hook, HookContext, HookResult } from '../types.js';

const CONTINUE: HookResult = { continue: true };

// ============================================================================
// Logging Hook
// ============================================================================

export const loggingHook: Hook = {
  name: 'logging',
  description: 'Logs tool executions to console',
  lifecycle: ['tool.execute.before', 'tool.execute.after'],
  priority: 10,
  enabled: false,
  handler: (ctx: HookContext): HookResult => {
    if (ctx.lifecycle === 'tool.execute.before' && ctx.toolCall) {
      console.log(`[Hook:logging] Tool: ${ctx.toolCall.name}`);
      console.log(`[Hook:logging] Args: ${JSON.stringify(ctx.toolCall.arguments, null, 2).slice(0, 200)}`);
    }
    if (ctx.lifecycle === 'tool.execute.after' && ctx.toolResult) {
      const preview = ctx.toolResult.content.slice(0, 100);
      console.log(`[Hook:logging] Result: ${preview}${ctx.toolResult.content.length > 100 ? '...' : ''}`);
    }
    return CONTINUE;
  },
};

// ============================================================================
// Timing Hook
// ============================================================================

const timings = new Map<string, number>();

export const timingHook: Hook = {
  name: 'timing',
  description: 'Tracks and reports tool execution times',
  lifecycle: ['tool.execute.before', 'tool.execute.after'],
  priority: 5,
  enabled: false,
  handler: (ctx: HookContext): HookResult => {
    if (!ctx.toolCall) return CONTINUE;

    if (ctx.lifecycle === 'tool.execute.before') {
      timings.set(ctx.toolCall.id, Date.now());
    } else if (ctx.lifecycle === 'tool.execute.after') {
      const startTime = timings.get(ctx.toolCall.id);
      if (startTime) {
        console.log(`[Hook:timing] ${ctx.toolCall.name}: ${Date.now() - startTime}ms`);
        timings.delete(ctx.toolCall.id);
      }
    }
    return CONTINUE;
  },
};

export function getTimingStats(): { pendingCount: number } {
  return { pendingCount: timings.size };
}

// ============================================================================
// Safety Hook
// ============================================================================

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/i,
  /rm\s+.*\s+\/$/,
  />\s*\/dev\/sd[a-z]/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev/i,
  /:(){:|:&};:/,
  /chmod\s+-R\s+777\s+\//,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
];

const BLOCKED_COMMANDS = ['shutdown', 'reboot', 'poweroff', 'halt', 'init 0', 'init 6'];

export const safetyHook: Hook = {
  name: 'safety',
  description: 'Blocks dangerous shell commands',
  lifecycle: 'tool.execute.before',
  priority: 1,
  enabled: true,
  handler: (ctx: HookContext): HookResult => {
    if (ctx.toolCall?.name !== 'bash') return CONTINUE;

    const command = ctx.toolCall.arguments.command as string;
    if (!command) return CONTINUE;

    // Check blocked commands
    for (const blocked of BLOCKED_COMMANDS) {
      if (command.trim().startsWith(blocked)) {
        console.warn(`[Hook:safety] BLOCKED: Command '${blocked}' is not allowed`);
        return {
          continue: false,
          modified: {
            toolResult: {
              toolCallId: ctx.toolCall.id,
              content: `Error: Command '${blocked}' is blocked for safety reasons.`,
              isError: true,
            },
          },
        };
      }
    }

    // Check dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        console.warn('[Hook:safety] BLOCKED: Dangerous command pattern detected');
        return {
          continue: false,
          modified: {
            toolResult: {
              toolCallId: ctx.toolCall.id,
              content: 'Error: This command pattern is blocked for safety reasons.',
              isError: true,
            },
          },
        };
      }
    }

    return CONTINUE;
  },
};

// ============================================================================
// Truncator Hook
// ============================================================================

const DEFAULT_MAX_SIZE = 50000;
let maxSize = DEFAULT_MAX_SIZE;

export function setMaxOutputSize(size: number): void {
  maxSize = size;
}

export function getMaxOutputSize(): number {
  return maxSize;
}

export const truncatorHook: Hook = {
  name: 'truncator',
  description: 'Truncates large tool outputs to prevent context overflow',
  lifecycle: 'tool.execute.after',
  priority: 90,
  enabled: true,
  handler: (ctx: HookContext): HookResult => {
    if (!ctx.toolResult || ctx.toolResult.content.length <= maxSize) {
      return CONTINUE;
    }

    const omitted = ctx.toolResult.content.length - maxSize;
    return {
      continue: true,
      modified: {
        toolResult: {
          ...ctx.toolResult,
          content: `${ctx.toolResult.content.slice(0, maxSize)}\n\n... [Truncated: ${omitted} characters omitted]`,
        },
      },
    };
  },
};

// ============================================================================
// Context Window Hook
// ============================================================================

const CHARS_PER_TOKEN = 4;
const DEFAULT_WARNING_THRESHOLD = 100000;
let totalChars = 0;
let warningThreshold = DEFAULT_WARNING_THRESHOLD;

export function setWarningThreshold(tokens: number): void {
  warningThreshold = tokens;
}

export function getStats(): { totalChars: number; estimatedTokens: number; threshold: number } {
  return {
    totalChars,
    estimatedTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
    threshold: warningThreshold,
  };
}

export function resetStats(): void {
  totalChars = 0;
}

export const contextWindowHook: Hook = {
  name: 'context-window',
  description: 'Monitors and warns about context window usage',
  lifecycle: ['chat.message.after', 'tool.execute.after'],
  priority: 95,
  enabled: false,
  handler: (ctx: HookContext): HookResult => {
    if (ctx.lifecycle === 'chat.message.after' && ctx.message) {
      totalChars += ctx.message.content.length;
      if (ctx.message.toolCalls) {
        for (const tc of ctx.message.toolCalls) {
          totalChars += JSON.stringify(tc.arguments).length;
        }
      }
    }

    if (ctx.lifecycle === 'tool.execute.after' && ctx.toolResult) {
      totalChars += ctx.toolResult.content.length;
    }

    const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    if (estimatedTokens > warningThreshold) {
      console.warn(`[Hook:context-window] WARNING: Estimated ${estimatedTokens} tokens (threshold: ${warningThreshold})`);
    }

    return {
      continue: true,
      metadata: { estimatedTokens, totalChars },
    };
  },
};

// ============================================================================
// All Built-in Hooks
// ============================================================================

export const builtInHooks: Hook[] = [
  loggingHook,
  timingHook,
  safetyHook,
  truncatorHook,
  contextWindowHook,
];
