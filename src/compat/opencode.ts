/**
 * OpenCode Compatibility Layer
 *
 * Enables nano-opencode to use the OpenCode/oh-my-opencode ecosystem:
 * - Load plugins from opencode.json
 * - Support OpenCode hook format
 * - Support OpenCode tool format
 * - Compatible with oh-my-opencode agents
 *
 * Config locations (same as OpenCode):
 * - ~/.config/opencode/opencode.json (global)
 * - .opencode/opencode.json (project)
 * - .opencode/oh-my-opencode.json (oh-my-opencode)
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn, execFileSync } from 'child_process';

// OpenCode config structure
export interface OpenCodeConfig {
  $schema?: string;
  plugin?: string[];
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  agents?: Record<string, OpenCodeAgent>;
  mcp?: Record<string, OpenCodeMCP>;
  hooks?: Record<string, boolean>;
  disabled_hooks?: string[];
}

export interface OpenCodeAgent {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: string[];
}

export interface OpenCodeMCP {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// OpenCode plugin context (what plugins receive)
export interface OpenCodePluginContext {
  project: {
    name: string;
    path: string;
  };
  client: {
    chat: (messages: unknown[], options?: unknown) => Promise<unknown>;
  };
  $: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  directory: string;
  worktree: string;
}

// OpenCode hook types
export type OpenCodeHookName =
  | 'command.executed'
  | 'file.edited'
  | 'file.watcher.updated'
  | 'message.updated'
  | 'session.created'
  | 'session.compacted'
  | 'session.idle'
  | 'tool.execute.before'
  | 'tool.execute.after'
  | 'todo.updated';

// OpenCode tool definition
export interface OpenCodeToolDef {
  description: string;
  args: Record<string, { type: string; description?: string }>;
  execute: (args: Record<string, unknown>, ctx: OpenCodePluginContext) => Promise<string>;
}

// Loaded plugin structure
export interface LoadedOpenCodePlugin {
  name: string;
  hooks?: Partial<Record<OpenCodeHookName, (...args: unknown[]) => Promise<void>>>;
  tool?: Record<string, OpenCodeToolDef>;
}

// Config paths
const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const GLOBAL_CONFIG = join(GLOBAL_CONFIG_DIR, 'opencode.json');
const PROJECT_CONFIG = '.opencode/opencode.json';
const OMO_CONFIG = '.opencode/oh-my-opencode.json';
const PLUGIN_CACHE = join(homedir(), '.cache', 'opencode', 'node_modules');

// Strip JSONC comments
function stripJsonc(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) return '';
      const idx = line.indexOf('//');
      if (idx > 0) {
        const before = line.substring(0, idx);
        if ((before.match(/"/g) || []).length % 2 === 0) {
          return line.substring(0, idx);
        }
      }
      return line;
    })
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
}

/**
 * Load OpenCode configuration
 */
export function loadOpenCodeConfig(): OpenCodeConfig {
  const config: OpenCodeConfig = {};

  // Load global config
  if (existsSync(GLOBAL_CONFIG)) {
    try {
      const content = readFileSync(GLOBAL_CONFIG, 'utf-8');
      Object.assign(config, JSON.parse(stripJsonc(content)));
    } catch {
      /* ignore */
    }
  }

  // Load project config (overrides global)
  const projectPath = join(process.cwd(), PROJECT_CONFIG);
  if (existsSync(projectPath)) {
    try {
      const content = readFileSync(projectPath, 'utf-8');
      const projectConfig = JSON.parse(stripJsonc(content));
      // Merge plugins arrays
      if (projectConfig.plugin && config.plugin) {
        projectConfig.plugin = [...new Set([...config.plugin, ...projectConfig.plugin])];
      }
      Object.assign(config, projectConfig);
    } catch {
      /* ignore */
    }
  }

  // Load oh-my-opencode config
  const omoPath = join(process.cwd(), OMO_CONFIG);
  if (existsSync(omoPath)) {
    try {
      const content = readFileSync(omoPath, 'utf-8');
      const omoConfig = JSON.parse(stripJsonc(content));
      // oh-my-opencode extends the base config
      if (omoConfig.agents) config.agents = { ...config.agents, ...omoConfig.agents };
      if (omoConfig.disabled_hooks) config.disabled_hooks = omoConfig.disabled_hooks;
    } catch {
      /* ignore */
    }
  }

  return config;
}

/**
 * Install npm plugins using Bun (safer: uses spawn, not shell)
 */
export async function installPlugins(plugins: string[]): Promise<void> {
  if (!plugins.length) return;

  // Ensure cache directory exists
  if (!existsSync(PLUGIN_CACHE)) {
    mkdirSync(PLUGIN_CACHE, { recursive: true });
  }

  // Check which plugins need installation
  const toInstall = plugins.filter((p) => {
    const pkgName = p.replace(/@[^/]+$/, ''); // Remove version
    const pkgPath = join(PLUGIN_CACHE, pkgName);
    return !existsSync(pkgPath);
  });

  if (!toInstall.length) return;

  console.log(`Installing ${toInstall.length} OpenCode plugin(s)...`);

  return new Promise((resolve, reject) => {
    // Use spawn with explicit args (no shell injection)
    const proc = spawn('bun', ['add', ...toInstall], {
      cwd: PLUGIN_CACHE,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Plugin installation failed with code ${code}`));
    });

    proc.on('error', () => {
      // Fallback to npm if bun not available
      const npm = spawn('npm', ['install', ...toInstall], {
        cwd: PLUGIN_CACHE,
        stdio: 'inherit',
      });
      npm.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Plugin installation failed`));
      });
    });
  });
}

/**
 * Load an OpenCode plugin
 */
export async function loadOpenCodePlugin(name: string): Promise<LoadedOpenCodePlugin | null> {
  try {
    // Try npm cache first
    const pkgName = name.replace(/@[^/]+$/, '');
    let pluginPath = join(PLUGIN_CACHE, pkgName);

    // Check local plugins
    if (!existsSync(pluginPath)) {
      const localPaths = [
        join(process.cwd(), '.opencode', 'plugins', name),
        join(GLOBAL_CONFIG_DIR, 'plugins', name),
      ];
      for (const p of localPaths) {
        if (existsSync(p)) {
          pluginPath = p;
          break;
        }
      }
    }

    if (!existsSync(pluginPath)) return null;

    // Dynamic import
    const mod = await import(pluginPath);
    const pluginFn = mod.default || Object.values(mod)[0];

    if (typeof pluginFn !== 'function') return null;

    // Create context
    const ctx = createPluginContext();

    // Execute plugin to get hooks/tools
    const result = await pluginFn(ctx);

    return {
      name,
      hooks: result,
      tool: result?.tool,
    };
  } catch (error) {
    console.error(`Failed to load plugin ${name}:`, error);
    return null;
  }
}

/**
 * Create plugin context (uses execFileSync for safety)
 */
function createPluginContext(): OpenCodePluginContext {
  const cwd = process.cwd();

  return {
    project: {
      name: cwd.split('/').pop() || 'unknown',
      path: cwd,
    },
    client: {
      chat: async () => ({ content: '' }), // Will be replaced with actual client
    },
    $: async (strings, ...values) => {
      // Parse template literal into command and args
      const fullCmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
      const parts = fullCmd.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      try {
        // Use execFileSync (no shell) for safety
        const stdout = execFileSync(cmd, args, { encoding: 'utf-8', cwd });
        return { stdout, stderr: '', exitCode: 0 };
      } catch (e: unknown) {
        const error = e as { stdout?: string; stderr?: string; status?: number };
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.status || 1,
        };
      }
    },
    directory: cwd,
    worktree: cwd,
  };
}

/**
 * Map OpenCode hooks to nano-opencode lifecycle
 */
export const HOOK_MAPPING: Record<OpenCodeHookName, string> = {
  'command.executed': 'command.execute.after',
  'file.edited': 'tool.execute.after',
  'file.watcher.updated': 'file.changed',
  'message.updated': 'chat.message.after',
  'session.created': 'session.start',
  'session.compacted': 'session.compact',
  'session.idle': 'session.idle',
  'tool.execute.before': 'tool.execute.before',
  'tool.execute.after': 'tool.execute.after',
  'todo.updated': 'todo.updated',
};

/**
 * Convert OpenCode tool to nano-opencode tool
 */
export function convertOpenCodeTool(
  name: string,
  def: OpenCodeToolDef,
  ctx: OpenCodePluginContext
) {
  return {
    name: `opencode_${name}`,
    description: def.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(def.args).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
      required: Object.keys(def.args),
    },
    execute: async (args: Record<string, unknown>) => def.execute(args, ctx),
  };
}

/**
 * Initialize OpenCode compatibility
 */
export async function initOpenCodeCompat(): Promise<{
  config: OpenCodeConfig;
  plugins: LoadedOpenCodePlugin[];
  tools: ReturnType<typeof convertOpenCodeTool>[];
}> {
  const config = loadOpenCodeConfig();
  const plugins: LoadedOpenCodePlugin[] = [];
  const tools: ReturnType<typeof convertOpenCodeTool>[] = [];

  // Install and load plugins
  if (config.plugin?.length) {
    try {
      await installPlugins(config.plugin);

      for (const pluginName of config.plugin) {
        const plugin = await loadOpenCodePlugin(pluginName);
        if (plugin) {
          plugins.push(plugin);

          // Convert tools
          if (plugin.tool) {
            const ctx = createPluginContext();
            for (const [name, def] of Object.entries(plugin.tool)) {
              tools.push(convertOpenCodeTool(name, def, ctx));
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load OpenCode plugins:', error);
    }
  }

  return { config, plugins, tools };
}

/**
 * Check if OpenCode config exists
 */
export function hasOpenCodeConfig(): boolean {
  return (
    existsSync(GLOBAL_CONFIG) ||
    existsSync(join(process.cwd(), PROJECT_CONFIG)) ||
    existsSync(join(process.cwd(), OMO_CONFIG))
  );
}

/**
 * Get oh-my-opencode agents
 */
export function getOmoAgents(config: OpenCodeConfig): Record<string, OpenCodeAgent> {
  return config.agents || {};
}
