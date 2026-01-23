/**
 * Sub-agent System - Spawn specialized agents for specific tasks
 *
 * Sub-agents are lightweight agent instances that can be spawned
 * to handle specific tasks with limited tool sets and turn counts.
 */

import type { LLMProvider, Message, Tool, AgentDefinition, ToolResult } from '../types.js';
import { filterToolsForAgent } from './registry.js';
import { getAllTools, executeTool } from '../tools/index.js';

// Sub-agent types with their tool configurations
export const SUB_AGENT_TYPES = {
  research: {
    description: 'Research and explore codebases',
    tools: ['glob', 'grep', 'read_file', 'list_dir', 'web_search'],
  },
  'code-review': {
    description: 'Review code for issues and improvements',
    tools: ['glob', 'grep', 'read_file', 'diff', 'git_diff'],
  },
  'test-writer': {
    description: 'Write tests for existing code',
    tools: ['glob', 'grep', 'read_file', 'write_file', 'bash'],
  },
  refactor: {
    description: 'Refactor and improve existing code',
    tools: ['glob', 'grep', 'read_file', 'edit_file', 'bash'],
  },
  documentation: {
    description: 'Generate or update documentation',
    tools: ['glob', 'grep', 'read_file', 'write_file', 'edit_file'],
  },
} as const;

export type SubAgentType = keyof typeof SUB_AGENT_TYPES;

export interface SubAgentOptions {
  type: SubAgentType;
  task: string;
  context?: string[]; // Relevant file paths
  maxTurns?: number;
}

export interface SubAgentResult {
  success: boolean;
  output: string;
  turns: number;
  toolsUsed: string[];
}

/**
 * Create a sub-agent definition from type
 */
function createSubAgentDefinition(type: SubAgentType, maxTurns: number): AgentDefinition {
  const config = SUB_AGENT_TYPES[type];

  return {
    name: `subagent-${type}`,
    description: config.description,
    systemPrompt: `You are a specialized ${type} sub-agent.
Your task is: ${config.description}

You have LIMITED tools: ${config.tools.join(', ')}

Guidelines:
- Focus ONLY on your specific task
- Work efficiently - you have limited turns
- When you've completed the task, summarize your findings
- If you cannot complete the task with available tools, explain why

Do NOT:
- Attempt to use tools not in your allowed list
- Go off on tangents unrelated to your task
- Make changes outside the scope of your task`,
    maxTurns,
    allowedTools: [...config.tools],
    category: 'specialist',
  };
}

/**
 * Run a sub-agent to completion
 */
export async function runSubAgent(
  provider: LLMProvider,
  options: SubAgentOptions
): Promise<SubAgentResult> {
  const { type, task, context = [], maxTurns = 10 } = options;

  // Create the sub-agent definition
  const definition = createSubAgentDefinition(type, maxTurns);

  // Get filtered tools for this sub-agent
  const allTools = getAllTools();
  const tools = filterToolsForAgent(allTools, definition);

  // Build initial message with context
  let userMessage = task;
  if (context.length > 0) {
    userMessage += `\n\nRelevant files:\n${context.map((f) => `- ${f}`).join('\n')}`;
  }

  const messages: Message[] = [{ role: 'user', content: userMessage }];

  let turn = 0;
  const toolsUsed: Set<string> = new Set();
  let lastOutput = '';

  while (turn < maxTurns) {
    turn++;

    // Get response from provider
    const response = await provider.chat(messages, tools, () => {}, definition.systemPrompt);

    // Collect assistant output
    if (response.content) {
      lastOutput = response.content;
    }

    messages.push(response);

    // If no tool calls, we're done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      break;
    }

    // Execute tool calls
    const results: ToolResult[] = [];
    for (const toolCall of response.toolCalls) {
      toolsUsed.add(toolCall.name);
      const result = await executeTool(toolCall.name, toolCall.arguments);
      results.push({
        toolCallId: toolCall.id,
        content: result,
        isError: result.startsWith('Error:'),
      });
    }

    // Add tool results as user message
    messages.push({
      role: 'user',
      content: '',
      toolResults: results,
    });
  }

  return {
    success: turn < maxTurns, // Didn't hit limit
    output: lastOutput,
    turns: turn,
    toolsUsed: Array.from(toolsUsed),
  };
}

/**
 * List available sub-agent types
 */
export function listSubAgentTypes(): Array<{ type: SubAgentType; description: string }> {
  return Object.entries(SUB_AGENT_TYPES).map(([type, config]) => ({
    type: type as SubAgentType,
    description: config.description,
  }));
}
