/**
 * Unified JSON-RPC 2.0 Types
 * Supports both MCP (newline-delimited) and LSP (Content-Length) framing
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type FramingType = 'newline' | 'content-length';

export interface RpcClientOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  framing: FramingType;
  timeout?: number;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  createdAt: number; // Timestamp for cleanup of stale requests
}
