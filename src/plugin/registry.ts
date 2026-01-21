/**
 * Plugin Registry
 * Caches loaded plugins for performance
 */

import type {
  PluginType,
  LoadedPlugin,
  AgentYaml,
  HookYaml,
  ServiceYaml,
  CommandYaml,
  SkillFrontmatter,
} from './types.js';
import {
  discoverAgents,
  discoverHooks,
  discoverServices,
  discoverCommands,
  discoverSkills,
  loadAgent,
  loadHook,
  loadService,
  loadCommand,
  loadSkill,
} from './loader.js';

// Cache for each plugin type
type CacheEntry<T> = { plugins: LoadedPlugin<T>[]; timestamp: number };
const cache = new Map<PluginType, CacheEntry<unknown>>();

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Check if cache is valid
 */
function isCacheValid(type: PluginType): boolean {
  const entry = cache.get(type);
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Get all plugins of a type (cached)
 */
function getCached<T>(type: PluginType, discover: () => LoadedPlugin<T>[]): LoadedPlugin<T>[] {
  if (!isCacheValid(type)) {
    cache.set(type, { plugins: discover(), timestamp: Date.now() });
  }
  return cache.get(type)!.plugins as LoadedPlugin<T>[];
}

/**
 * Invalidate cache for a plugin type
 */
export function invalidateCache(type?: PluginType): void {
  if (type) {
    cache.delete(type);
  } else {
    cache.clear();
  }
}

// Typed getters
export function getAgents(): LoadedPlugin<AgentYaml>[] {
  return getCached('agent', discoverAgents);
}

export function getHooks(): LoadedPlugin<HookYaml>[] {
  return getCached('hook', discoverHooks);
}

export function getServices(): LoadedPlugin<ServiceYaml>[] {
  return getCached('service', discoverServices);
}

export function getCommands(): LoadedPlugin<CommandYaml>[] {
  return getCached('command', discoverCommands);
}

export function getSkills(): LoadedPlugin<SkillFrontmatter & { content: string }>[] {
  return getCached('skill', discoverSkills);
}

// Single item getters (uses loader directly for freshness)
export function getAgent(name: string): LoadedPlugin<AgentYaml> | null {
  // First check cache
  const cached = cache.get('agent')?.plugins as LoadedPlugin<AgentYaml>[] | undefined;
  const fromCache = cached?.find(p => p.meta.name === name);
  if (fromCache) return fromCache;

  // Fall back to direct load
  return loadAgent(name);
}

export function getHook(name: string): LoadedPlugin<HookYaml> | null {
  const cached = cache.get('hook')?.plugins as LoadedPlugin<HookYaml>[] | undefined;
  const fromCache = cached?.find(p => p.meta.name === name);
  if (fromCache) return fromCache;
  return loadHook(name);
}

export function getService(name: string): LoadedPlugin<ServiceYaml> | null {
  const cached = cache.get('service')?.plugins as LoadedPlugin<ServiceYaml>[] | undefined;
  const fromCache = cached?.find(p => p.meta.name === name);
  if (fromCache) return fromCache;
  return loadService(name);
}

export function getCommand(name: string): LoadedPlugin<CommandYaml> | null {
  const cached = cache.get('command')?.plugins as LoadedPlugin<CommandYaml>[] | undefined;
  const fromCache = cached?.find(p => p.meta.name === name);
  if (fromCache) return fromCache;
  return loadCommand(name);
}

export function getSkill(name: string): LoadedPlugin<SkillFrontmatter & { content: string }> | null {
  const cached = cache.get('skill')?.plugins as LoadedPlugin<SkillFrontmatter & { content: string }>[] | undefined;
  const fromCache = cached?.find(p => p.meta.name === name);
  if (fromCache) return fromCache;
  return loadSkill(name);
}
