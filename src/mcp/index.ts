/**
 * MCP (Model Context Protocol) Integration
 *
 * Provides support for connecting to MCP servers and using their tools.
 */

export { MCPClient } from './client.js';
export { mcpRegistry } from './registry.js';
export { mcpToolToNanoTool, stripMcpPrefix, isMcpTool, getServerIdFromToolName } from './tool-adapter.js';
export type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPResource,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPToolCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types.js';

import { mcpRegistry } from './registry.js';
import { setDynamicTools } from '../tools/index.js';
import type { MCPServerConfig } from './types.js';

/**
 * Initialize MCP servers from config
 */
export async function initializeMCP(config: {
  servers?: Record<string, MCPServerConfig>;
  timeout?: number;
}): Promise<void> {
  if (!config.servers || Object.keys(config.servers).length === 0) {
    return;
  }

  console.log('[MCP] Initializing MCP servers...');

  await mcpRegistry.startAll(config);

  // Register MCP tools as dynamic tools
  const mcpTools = mcpRegistry.getTools();
  setDynamicTools(mcpTools);

  console.log(`[MCP] Registered ${mcpTools.length} tools from MCP servers`);
}

/**
 * Shutdown all MCP servers
 */
export async function shutdownMCP(): Promise<void> {
  await mcpRegistry.stopAll();
  setDynamicTools([]);
}
