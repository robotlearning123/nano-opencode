/**
 * Hook Executor - executes hooks for lifecycle events
 */

import type {
  HookLifecycle,
  HookContext,
  HookResult,
  Message,
  ToolCall,
  ToolResult,
  Session,
  AgentInstance,
} from '../types.js';
import { hookRegistry } from './registry.js';

const DEFAULT_RESULT: HookResult = { continue: true };

/**
 * Execute all hooks for a given lifecycle
 */
export async function executeHooks(
  lifecycle: HookLifecycle,
  context: Omit<HookContext, 'lifecycle' | 'timestamp'>
): Promise<HookResult> {
  const hooks = hookRegistry.getForLifecycle(lifecycle);
  if (hooks.length === 0) return DEFAULT_RESULT;

  const fullContext: HookContext = { ...context, lifecycle, timestamp: Date.now() };
  const aggregatedResult: HookResult = { ...DEFAULT_RESULT };
  let currentContext = fullContext;

  for (const hook of hooks) {
    try {
      const result = await hook.handler(currentContext);

      if (!result.continue) {
        return {
          continue: false,
          modified: result.modified,
          metadata: { ...aggregatedResult.metadata, ...result.metadata },
        };
      }

      if (result.modified) {
        if (result.modified.message)
          currentContext = { ...currentContext, message: result.modified.message };
        if (result.modified.toolCall)
          currentContext = { ...currentContext, toolCall: result.modified.toolCall };
        if (result.modified.toolResult)
          currentContext = { ...currentContext, toolResult: result.modified.toolResult };
        aggregatedResult.modified = { ...aggregatedResult.modified, ...result.modified };
      }

      if (result.metadata) {
        aggregatedResult.metadata = { ...aggregatedResult.metadata, ...result.metadata };
      }
    } catch (error) {
      console.error(`Hook ${hook.name} failed:`, error);
    }
  }

  return aggregatedResult;
}

// Helper functions for common lifecycle events
export function beforeChatMessage(
  message: Message,
  session?: Session,
  agent?: AgentInstance
): Promise<HookResult> {
  return executeHooks('chat.message.before', { message, session, agent });
}

export function afterChatMessage(
  message: Message,
  session?: Session,
  agent?: AgentInstance
): Promise<HookResult> {
  return executeHooks('chat.message.after', { message, session, agent });
}

export function beforeToolExecute(
  toolCall: ToolCall,
  session?: Session,
  agent?: AgentInstance
): Promise<HookResult> {
  return executeHooks('tool.execute.before', { toolCall, session, agent });
}

export function afterToolExecute(
  toolCall: ToolCall,
  toolResult: ToolResult,
  session?: Session,
  agent?: AgentInstance
): Promise<HookResult> {
  return executeHooks('tool.execute.after', { toolCall, toolResult, session, agent });
}

export function onSessionStart(session: Session, agent?: AgentInstance): Promise<HookResult> {
  return executeHooks('session.start', { session, agent });
}

export function onSessionEnd(session: Session, agent?: AgentInstance): Promise<HookResult> {
  return executeHooks('session.end', { session, agent });
}
