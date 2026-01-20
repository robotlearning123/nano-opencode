/**
 * MCP Registry - manages MCP server connections
 */

import type { Tool } from '../types.js';
import type { MCPServerConfig, MCPToolDefinition } from './types.js';
import { MCPClient } from './client.js';
import { mcpToolToNanoTool } from './tool-adapter.js';

/**
 * MCP Registry class
 */
class MCPRegistry {
  private clients = new Map<string, MCPClient>();
  private tools = new Map<string, Tool>();

  /**
   * Start all MCP servers from config
   */
  async startAll(config: { servers?: Record<string, MCPServerConfig> }): Promise<void> {
    if (!config.servers) return;

    const startPromises: Promise<void>[] = [];

    for (const [serverId, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.enabled === false) {
        console.log(`[MCP] Skipping disabled server: ${serverId}`);
        continue;
      }

      startPromises.push(
        this.startServer(serverId, serverConfig).catch((error) => {
          console.error(`[MCP] Failed to start server ${serverId}:`, error.message);
        })
      );
    }

    await Promise.all(startPromises);
  }

  /**
   * Start a single MCP server
   */
  async startServer(serverId: string, config: MCPServerConfig): Promise<void> {
    if (this.clients.has(serverId)) {
      console.log(`[MCP] Server ${serverId} already running`);
      return;
    }

    console.log(`[MCP] Starting server: ${serverId}`);
    const client = new MCPClient(serverId, config);

    try {
      await client.connect();
      this.clients.set(serverId, client);

      // Load tools
      const mcpTools = await client.listTools();
      console.log(`[MCP] Server ${serverId} provides ${mcpTools.length} tools`);

      // Register tools
      for (const mcpTool of mcpTools) {
        const nanoTool = mcpToolToNanoTool(mcpTool, client, serverId);
        this.tools.set(nanoTool.name, nanoTool);
      }
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a server
   */
  stopServer(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client) {
      // Remove tools from this server
      const prefix = `mcp_${serverId}_`;
      for (const [name] of this.tools) {
        if (name.startsWith(prefix)) {
          this.tools.delete(name);
        }
      }

      client.disconnect();
      this.clients.delete(serverId);
      console.log(`[MCP] Stopped server: ${serverId}`);
    }
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    for (const serverId of this.clients.keys()) {
      this.stopServer(serverId);
    }
  }

  /**
   * Get all MCP tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * List connected servers
   */
  listServers(): Array<{ id: string; connected: boolean; toolCount: number }> {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      connected: client.isConnected(),
      toolCount: client.getCachedTools().length,
    }));
  }

  /**
   * Get client by server ID
   */
  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }
}

// Singleton instance
export const mcpRegistry = new MCPRegistry();
