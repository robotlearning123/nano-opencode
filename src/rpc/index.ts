/**
 * Unified RPC Module
 * Exports the JSON-RPC client and types
 */

export { RpcClient } from './client.js';
export type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcError,
  FramingType,
  RpcClientOptions,
  PendingRequest,
} from './types.js';
