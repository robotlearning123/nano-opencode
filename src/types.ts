// Core types for nano-opencode

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
  }>;
  required: string[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Config {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
}

export interface LLMProvider {
  name: string;
  chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<Message>;
}
