/**
 * Plugin Loader
 * Discovers and loads plugins from filesystem
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';
import type {
  PluginType,
  PluginMeta,
  LoadedPlugin,
  AgentYaml,
  HookYaml,
  ServiceYaml,
  CommandYaml,
  SkillFrontmatter,
} from './types.js';

// Plugin directories
const BUILTIN_DIR = join(import.meta.dirname || __dirname, '../../builtin');
const USER_DIR = join(homedir(), '.nano');
const PROJECT_DIR = join(process.cwd(), '.nano');

// Type-to-subdirectory mapping
const TYPE_DIRS: Record<PluginType, string> = {
  agent: 'agents',
  tool: 'tools',
  hook: 'hooks',
  service: 'services',
  skill: 'skills',
  command: 'commands',
};

/**
 * Get all possible paths for a plugin type
 */
function getPluginPaths(type: PluginType): { path: string; source: 'builtin' | 'user' | 'project' }[] {
  const subdir = TYPE_DIRS[type];
  return [
    { path: join(BUILTIN_DIR, subdir), source: 'builtin' as const },
    { path: join(USER_DIR, subdir), source: 'user' as const },
    { path: join(PROJECT_DIR, subdir), source: 'project' as const },
  ].filter(p => existsSync(p.path));
}

/**
 * Parse YAML file
 */
function parseYaml<T>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return yaml.load(content) as T;
  } catch {
    return null;
  }
}

/**
 * Parse Markdown with YAML frontmatter
 */
function parseMarkdown(filePath: string): { frontmatter: SkillFrontmatter; content: string } | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = yaml.load(match[1]) as SkillFrontmatter;
    return { frontmatter, content: match[2].trim() };
  } catch {
    return null;
  }
}

/**
 * Discover all plugins of a given type
 */
export function discoverPlugins<T>(type: PluginType): LoadedPlugin<T>[] {
  const plugins: LoadedPlugin<T>[] = [];
  const seen = new Set<string>();
  const ext = type === 'skill' ? '.md' : '.yaml';

  // Load in priority order: project > user > builtin
  // Later sources override earlier ones (same name)
  const paths = getPluginPaths(type).reverse();

  for (const { path, source } of paths) {
    try {
      const files = readdirSync(path).filter(f => f.endsWith(ext));

      for (const file of files) {
        const name = basename(file, ext);
        const filePath = join(path, file);

        if (seen.has(name)) continue; // Already loaded from higher priority source

        let config: T | null = null;

        if (type === 'skill') {
          const parsed = parseMarkdown(filePath);
          if (parsed) {
            config = { ...parsed.frontmatter, content: parsed.content } as T;
          }
        } else {
          config = parseYaml<T>(filePath);
        }

        if (config) {
          seen.add(name);
          plugins.push({
            meta: { name, type, source, path: filePath },
            config,
          });
        }
      }
    } catch {
      // Directory not readable
    }
  }

  return plugins;
}

/**
 * Load a specific plugin by name
 */
export function loadPlugin<T>(type: PluginType, name: string): LoadedPlugin<T> | null {
  const ext = type === 'skill' ? '.md' : '.yaml';

  // Check in priority order: project > user > builtin
  for (const { path, source } of getPluginPaths(type).reverse()) {
    const filePath = join(path, `${name}${ext}`);
    if (!existsSync(filePath)) continue;

    let config: T | null = null;

    if (type === 'skill') {
      const parsed = parseMarkdown(filePath);
      if (parsed) {
        config = { ...parsed.frontmatter, content: parsed.content } as T;
      }
    } else {
      config = parseYaml<T>(filePath);
    }

    if (config) {
      return {
        meta: { name, type, source, path: filePath },
        config,
      };
    }
  }

  return null;
}

// Typed loaders for convenience
export const loadAgent = (name: string) => loadPlugin<AgentYaml>('agent', name);
export const loadHook = (name: string) => loadPlugin<HookYaml>('hook', name);
export const loadService = (name: string) => loadPlugin<ServiceYaml>('service', name);
export const loadCommand = (name: string) => loadPlugin<CommandYaml>('command', name);
export const loadSkill = (name: string) => loadPlugin<SkillFrontmatter & { content: string }>('skill', name);

export const discoverAgents = () => discoverPlugins<AgentYaml>('agent');
export const discoverHooks = () => discoverPlugins<HookYaml>('hook');
export const discoverServices = () => discoverPlugins<ServiceYaml>('service');
export const discoverCommands = () => discoverPlugins<CommandYaml>('command');
export const discoverSkills = () => discoverPlugins<SkillFrontmatter & { content: string }>('skill');
