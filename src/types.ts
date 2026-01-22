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
  properties: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
    }
  >;
  required: string[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  apiKey?: string; // Direct key or variable reference {env:VAR} or {file:path}
  baseURL?: string; // Custom API endpoint
}

/**
 * Agent configuration for model selection
 */
export interface AgentConfig {
  model?: string; // Provider/model format (e.g., "anthropic/claude-sonnet-4-5")
  temperature?: number;
  maxTokens?: number;
  variant?: string; // Model variant (e.g., "max" for Anthropic capacity tier)
}

/**
 * Model category preset
 */
export interface ModelCategory {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Main configuration (OpenCode-compatible format)
 */
export interface Config {
  // Provider settings
  provider: 'anthropic' | 'openai' | 'gemini';
  providers?: Record<string, ProviderConfig>;

  // Model settings
  model: string;
  maxTokens: number;
  temperature: number;

  // Legacy: direct API key (prefer providers section)
  apiKey?: string;

  // Agent configurations
  agents?: Record<string, AgentConfig>;

  // Model category presets
  categories?: Record<string, ModelCategory>;

  // Experimental features
  experimental?: {
    auto_resume?: boolean;
  };

  // MCP (Model Context Protocol) servers
  mcp?: {
    servers?: Record<
      string,
      {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        enabled?: boolean;
        timeout?: number;
      }
    >;
    timeout?: number; // Default connection timeout for all servers
  };

  // Hooks configuration
  hooks?: {
    enabled?: string[]; // Hooks to enable (overrides defaults)
    disabled?: string[]; // Hooks to disable
  };
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface LLMProvider {
  name: string;
  chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void,
    systemPrompt?: string // Agent-specific system prompt
  ): Promise<Message>;
}

// ============================================================================
// Agent System Types
// ============================================================================

/**
 * Built-in agent names
 */
export type BuiltInAgentName =
  | 'sisyphus' // Orchestrator, full capability
  | 'oracle' // Read-only advisor
  | 'librarian' // Documentation explorer
  | 'explore' // Codebase search
  | 'junior' // Simple executor
  | 'prometheus' // Strategic planner
  | 'metis' // Pre-planning consultant
  | 'momus' // Plan reviewer
  | 'frontend' // UI development
  | 'multimodal'; // Image/PDF analysis

/**
 * Agent name (built-in or custom)
 */
export type AgentName = BuiltInAgentName | string;

/**
 * Agent category for organization
 */
export type AgentCategory = 'orchestrator' | 'specialist' | 'advisor' | 'utility';

/**
 * Agent definition - describes an agent's capabilities and configuration
 */
export interface AgentDefinition {
  name: AgentName;
  description: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTurns?: number; // Default: 50
  allowedTools?: string[]; // Whitelist (if set, only these tools available)
  disallowedTools?: string[]; // Blacklist (takes precedence over allowedTools)
  category?: AgentCategory;
}

/**
 * Agent instance - runtime agent with tools and prompt
 */
export interface AgentInstance {
  definition: AgentDefinition;
  getTools(allTools: Tool[]): Tool[];
  getSystemPrompt(): string;
}

/**
 * YAML agent config format for user-defined agents
 */
export interface AgentYamlConfig {
  name: string;
  description: string;
  system_prompt: string;
  model?: string;
  temperature?: number;
  max_turns?: number;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  category?: AgentCategory;
}

// ============================================================================
// Hook System Types
// ============================================================================

/**
 * Hook lifecycle events
 */
export type HookLifecycle =
  | 'chat.message.before' // Before processing user message
  | 'chat.message.after' // After assistant response
  | 'tool.execute.before' // Before tool execution
  | 'tool.execute.after' // After tool execution
  | 'session.start' // Session started
  | 'session.end' // Session ending
  | 'message.transform'; // Transform message content

/**
 * Context passed to hooks
 */
export interface HookContext {
  lifecycle: HookLifecycle;
  message?: Message;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  session?: Session;
  agent?: AgentInstance;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result returned from hooks
 */
export interface HookResult {
  continue: boolean; // false = stop processing, skip remaining hooks
  modified?: {
    message?: Message;
    toolCall?: ToolCall;
    toolResult?: ToolResult;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Hook definition
 */
export interface Hook {
  name: string;
  description?: string;
  lifecycle: HookLifecycle | HookLifecycle[]; // Can handle multiple lifecycles
  priority?: number; // Lower = runs first, default 100
  enabled?: boolean; // Default true
  handler: (ctx: HookContext) => Promise<HookResult> | HookResult;
}
