/**
 * Plugin System Types
 * Defines the interfaces for all plugin types
 */

import type { Tool, AgentDefinition, Hook } from '../types.js';

// Plugin categories
export type PluginType = 'agent' | 'tool' | 'hook' | 'service' | 'skill' | 'command';

// Base plugin metadata
export interface PluginMeta {
  name: string;
  type: PluginType;
  description?: string;
  source: 'builtin' | 'user' | 'project';
  path: string;
}

// Agent YAML format
export interface AgentYaml {
  name: string;
  description: string;
  prompt: string;  // System prompt (supports multi-line |)
  model?: string;
  temperature?: number;
  max_turns?: number;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  category?: 'orchestrator' | 'specialist' | 'advisor' | 'utility';
}

// Hook YAML format
export interface HookYaml {
  name: string;
  description?: string;
  lifecycle: string | string[];
  priority?: number;
  enabled?: boolean;
  when?: {
    tool?: string[];
    pattern?: string;
  };
  action?: {
    shell?: string;
    transform?: string;
  };
}

// Service YAML format (MCP/LSP)
export interface ServiceYaml {
  name: string;
  type: 'mcp' | 'lsp';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  lazy?: boolean;
  timeout?: number;
  triggers?: { pattern: string }[];
  extensions?: string[];
  root_patterns?: string[];
}

// Command YAML format
export interface CommandYaml {
  name: string;
  aliases?: string[];
  description: string;
  prompt: string;
}

// Skill Markdown frontmatter
export interface SkillFrontmatter {
  name: string;
  description: string;
  tags?: string[];
}

// Loaded plugin types
export interface LoadedPlugin<T = unknown> {
  meta: PluginMeta;
  config: T;
}

export type LoadedAgent = LoadedPlugin<AgentYaml>;
export type LoadedHook = LoadedPlugin<HookYaml>;
export type LoadedService = LoadedPlugin<ServiceYaml>;
export type LoadedCommand = LoadedPlugin<CommandYaml>;
export type LoadedSkill = LoadedPlugin<SkillFrontmatter & { content: string }>;

// Plugin locations
export interface PluginLocations {
  builtin: string;  // Shipped with package
  user: string;     // ~/.nano/
  project: string;  // .nano/
}
