/**
 * Unified JSON-RPC 2.0 Client
 * Supports both MCP (newline-delimited) and LSP (Content-Length) framing
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  RpcClientOptions,
  PendingRequest,
  FramingType,
} from './types.js';

export class RpcClient {
  private process: ChildProcess | null = null;
  private options: RpcClientOptions;
  private requestId = 0;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private buffer = '';
  private connected = false;

  constructor(options: RpcClientOptions) {
    this.options = { timeout: 30000, ...options };
  }

  async connect(): Promise<void> {
    if (this.process) throw new Error('Already connected');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.disconnect();
        reject(new Error(`Connection timeout (${this.options.timeout}ms)`));
      }, this.options.timeout);

      try {
        this.process = spawn(this.options.command, this.options.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.options.env },
        });

        this.process.stdout?.on('data', (data) => this.handleData(data.toString()));
        this.process.stderr?.on('data', (data) => console.error(`[RPC] ${data}`));
        this.process.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
        this.process.on('close', (code) => {
          if (!this.connected) {
            clearTimeout(timeoutId);
            reject(new Error(`Exit code ${code}`));
          }
          this.process = null;
          this.connected = false;
        });

        this.connected = true;
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    if (this.options.framing === 'newline') {
      this.parseNewlineFraming();
    } else {
      this.parseContentLengthFraming();
    }
  }

  private parseNewlineFraming(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      this.processMessage(line);
    }
  }

  private parseContentLengthFraming(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;
      if (this.buffer.length < contentStart + contentLength) break;

      const content = this.buffer.slice(contentStart, contentStart + contentLength);
      this.buffer = this.buffer.slice(contentStart + contentLength);
      this.processMessage(content);
    }
  }

  private processMessage(content: string): void {
    try {
      const msg = JSON.parse(content) as JsonRpcResponse;
      if (msg.id !== undefined) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if (pending.timeoutId) clearTimeout(pending.timeoutId);
          msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private send(msg: object): void {
    if (!this.process?.stdin) return;

    const content = JSON.stringify(msg);
    if (this.options.framing === 'newline') {
      this.process.stdin.write(content + '\n');
    } else {
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      this.process.stdin.write(header + content);
    }
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.process?.stdin) throw new Error('Not connected');

    const id = this.options.framing === 'newline' ? randomUUID() : ++this.requestId;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.timeout);

      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject, timeoutId });
      this.send(request);
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    this.send(notification);
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) this.process.kill('SIGKILL');
      }, 1000);
      this.process = null;
    }

    for (const pending of this.pendingRequests.values()) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.process !== null;
  }
}
