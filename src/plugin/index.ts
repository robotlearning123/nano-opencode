/**
 * Plugin System
 * Unified plugin discovery, loading, and caching
 */

// Re-export types
export type {
  PluginType,
  PluginMeta,
  LoadedPlugin,
  AgentYaml,
  HookYaml,
  ServiceYaml,
  CommandYaml,
  SkillFrontmatter,
  LoadedAgent,
  LoadedHook,
  LoadedService,
  LoadedCommand,
  LoadedSkill,
  PluginLocations,
} from './types.js';

// Re-export loader functions
export {
  discoverPlugins,
  loadPlugin,
  loadAgent,
  loadHook,
  loadService,
  loadCommand,
  loadSkill,
  discoverAgents,
  discoverHooks,
  discoverServices,
  discoverCommands,
  discoverSkills,
} from './loader.js';

// Re-export registry functions
export {
  invalidateCache,
  getAgents,
  getHooks,
  getServices,
  getCommands,
  getSkills,
  getAgent,
  getHook,
  getService,
  getCommand,
  getSkill,
} from './registry.js';
