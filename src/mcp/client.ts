/**
 * MCP Client - communicates with MCP servers via JSON-RPC over stdio
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPToolCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types.js';

export class MCPClient {
  readonly serverId: string;
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestMap = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private initialized = false;
  private tools: MCPToolDefinition[] = [];

  constructor(serverId: string, config: MCPServerConfig) {
    this.serverId = serverId;
    this.config = config;
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.process) {
      throw new Error('Already connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout || 30000;
      const timeoutId = setTimeout(() => {
        this.disconnect();
        reject(new Error(`Connection timeout (${timeout}ms)`));
      }, timeout);

      try {
        this.process = spawn(this.config.command, this.config.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.config.env },
        });

        this.process.stdout?.on('data', (data) => {
          this.handleData(data.toString());
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[MCP:${this.serverId}] stderr:`, data.toString());
        });

        this.process.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });

        this.process.on('close', (code) => {
          if (!this.initialized) {
            clearTimeout(timeoutId);
            reject(new Error(`Process exited with code ${code}`));
          }
          this.process = null;
        });

        // Initialize the connection
        this.initialize()
          .then(() => {
            clearTimeout(timeoutId);
            this.initialized = true;
            resolve();
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            this.disconnect();
            reject(error);
          });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming data from the server
   */
  private handleData(data: string): void {
    this.buffer += data;

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const pending = this.requestMap.get(response.id);

        if (pending) {
          this.requestMap.delete(response.id);

          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (error) {
        console.error(`[MCP:${this.serverId}] Invalid JSON:`, line);
      }
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('Not connected');
    }

    const id = randomUUID();
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.requestMap.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Initialize the MCP connection
   */
  private async initialize(): Promise<MCPInitializeResult> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'nano-opencode',
        version: '0.0.1',
      },
    });

    // Send initialized notification
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n');
    }

    return result as MCPInitializeResult;
  }

  /**
   * List available tools from the server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.initialized) {
      throw new Error('Not initialized');
    }

    const result = await this.sendRequest('tools/list') as MCPToolsListResult;
    this.tools = result.tools || [];
    return this.tools;
  }

  /**
   * Call a tool on the server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      throw new Error('Not initialized');
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as MCPToolCallResult;

    // Convert result to string
    if (result.content && result.content.length > 0) {
      return result.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text)
        .join('\n');
    }

    return '';
  }

  /**
   * Get cached tools
   */
  getCachedTools(): MCPToolDefinition[] {
    return this.tools;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 1000);
      this.process = null;
    }

    // Reject pending requests
    for (const [, pending] of this.requestMap) {
      pending.reject(new Error('Disconnected'));
    }
    this.requestMap.clear();

    this.initialized = false;
    this.tools = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.initialized && this.process !== null;
  }
}
