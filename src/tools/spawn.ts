/**
 * Spawn Agent Tool - Create specialized sub-agents for specific tasks
 *
 * Sub-agents are lightweight agent instances with limited tools and turns.
 */

import type { Tool } from '../types.js';
import { listSubAgentTypes, type SubAgentType } from '../agents/subagent.js';

// Note: The actual runSubAgent requires an LLMProvider instance,
// which needs to be injected at runtime. This tool definition
// will be enhanced when integrated with the main agent loop.

export const spawnAgentTool: Tool = {
  name: 'spawn_agent',
  description: `Spawn a specialized sub-agent to handle a specific task. Sub-agents have limited tools and turns.

Available agent types:
- research: Explore codebases (glob, grep, read_file, list_dir, web_search)
- code-review: Review code for issues (glob, grep, read_file, diff, git_diff)
- test-writer: Write tests for code (glob, grep, read_file, write_file, bash)
- refactor: Refactor existing code (glob, grep, read_file, edit_file, bash)
- documentation: Generate/update docs (glob, grep, read_file, write_file, edit_file)

Use sub-agents for focused tasks that benefit from specialized tool sets.`,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'The sub-agent type to spawn',
        enum: ['research', 'code-review', 'test-writer', 'refactor', 'documentation'],
      },
      task: {
        type: 'string',
        description: 'The specific task for the sub-agent to perform',
      },
      context: {
        type: 'string',
        description: 'Comma-separated list of relevant file paths to provide as context',
      },
      max_turns: {
        type: 'number',
        description: 'Maximum turns for the sub-agent (default: 10, max: 20)',
      },
    },
    required: ['type', 'task'],
  },
  execute: async (args) => {
    const type = args.type as SubAgentType;
    const task = args.task as string;
    const contextStr = args.context as string | undefined;
    const maxTurns = Math.min((args.max_turns as number) || 10, 20);

    if (!type || !task) {
      return 'Error: Both type and task are required';
    }

    // Validate agent type
    const validTypes = listSubAgentTypes();
    if (!validTypes.find((t) => t.type === type)) {
      return `Error: Invalid agent type "${type}". Valid types: ${validTypes.map((t) => t.type).join(', ')}`;
    }

    // Parse context files
    const context = contextStr ? contextStr.split(',').map((f) => f.trim()) : [];

    // Return a marker for the main agent loop to intercept and execute
    return JSON.stringify({
      __subagent__: true,
      type,
      task,
      context,
      maxTurns,
    });
  },
};

export const listAgentsTool: Tool = {
  name: 'list_agents',
  description: 'List available sub-agent types and their capabilities',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => {
    const agents = listSubAgentTypes();
    const lines = ['Available sub-agent types:', ''];

    for (const agent of agents) {
      lines.push(`• ${agent.type}: ${agent.description}`);
    }

    lines.push('');
    lines.push('Use spawn_agent to create a sub-agent for a specific task.');

    return lines.join('\n');
  },
};
