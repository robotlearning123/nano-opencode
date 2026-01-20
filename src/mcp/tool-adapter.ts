/**
 * MCP Tool Adapter - converts MCP tools to nano-opencode tools
 */

import type { Tool, ToolParameters } from '../types.js';
import type { MCPToolDefinition } from './types.js';
import { MCPClient } from './client.js';

/**
 * Convert MCP tool definition to nano-opencode Tool
 */
export function mcpToolToNanoTool(
  mcpTool: MCPToolDefinition,
  client: MCPClient,
  serverId: string
): Tool {
  // Create unique name with prefix
  const name = `mcp_${serverId}_${mcpTool.name}`;

  // Convert input schema to nano-opencode parameters
  const parameters: ToolParameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  if (mcpTool.inputSchema?.properties) {
    for (const [key, prop] of Object.entries(mcpTool.inputSchema.properties)) {
      parameters.properties[key] = {
        type: prop.type || 'string',
        description: prop.description || '',
        enum: prop.enum,
      };
    }
    parameters.required = mcpTool.inputSchema.required || [];
  }

  return {
    name,
    description: mcpTool.description || `MCP tool from ${serverId}: ${mcpTool.name}`,
    parameters,
    execute: async (args: Record<string, unknown>): Promise<string> => {
      try {
        const result = await client.callTool(mcpTool.name, args);
        return result || '(no output)';
      } catch (error) {
        return `Error calling MCP tool ${mcpTool.name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

/**
 * Strip MCP prefix from tool name to get original name
 */
export function stripMcpPrefix(toolName: string): string {
  const match = toolName.match(/^mcp_[^_]+_(.+)$/);
  return match ? match[1] : toolName;
}

/**
 * Check if tool is an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp_');
}

/**
 * Get server ID from MCP tool name
 */
export function getServerIdFromToolName(toolName: string): string | null {
  const match = toolName.match(/^mcp_([^_]+)_/);
  return match ? match[1] : null;
}
