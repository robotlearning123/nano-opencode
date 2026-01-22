/**
 * MCP Client - communicates with MCP servers via JSON-RPC over stdio
 * Uses the unified RPC client with newline framing
 */

import { RpcClient } from '../rpc/index.js';
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPToolCallResult,
} from './types.js';

export class MCPClient {
  readonly serverId: string;
  private config: MCPServerConfig;
  private rpc: RpcClient | null = null;
  private initialized = false;
  private tools: MCPToolDefinition[] = [];

  constructor(serverId: string, config: MCPServerConfig) {
    this.serverId = serverId;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.rpc) throw new Error('Already connected');

    this.rpc = new RpcClient({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      framing: 'newline',
      timeout: this.config.timeout || 30000,
    });

    await this.rpc.connect();
    await this.initialize();
    this.initialized = true;
  }

  private async initialize(): Promise<MCPInitializeResult> {
    if (!this.rpc) throw new Error('Not connected');

    const result = await this.rpc.request<MCPInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nano-opencode', version: '0.0.1' },
    });

    this.rpc.notify('notifications/initialized');
    return result;
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.rpc || !this.initialized) throw new Error('Not initialized');

    const result = await this.rpc.request<MCPToolsListResult>('tools/list');
    this.tools = result.tools || [];
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.rpc || !this.initialized) throw new Error('Not initialized');

    const result = await this.rpc.request<MCPToolCallResult>('tools/call', {
      name,
      arguments: args,
    });

    if (result.content?.length) {
      return result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');
    }
    return '';
  }

  getCachedTools(): MCPToolDefinition[] {
    return this.tools;
  }

  disconnect(): void {
    this.rpc?.disconnect();
    this.rpc = null;
    this.initialized = false;
    this.tools = [];
  }

  isConnected(): boolean {
    return this.initialized && this.rpc?.isConnected() === true;
  }
}
