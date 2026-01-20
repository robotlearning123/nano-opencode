/**
 * Configuration system for nano-opencode
 * Follows OpenCode patterns with variable substitution and config hierarchy
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config, ProviderConfig } from './types.js';
import { resolveConfigValue } from './utils.js';
import { getAuth } from './auth.js';
import { ENV_KEY_MAP, DEFAULT_MODELS, type SupportedProvider } from './constants.js';

// Config paths
const CONFIG_DIR = join(homedir(), '.config', 'nano-opencode');
const GLOBAL_CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const PROJECT_CONFIG_FILE = '.nano-opencode/config.json';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
};

/**
 * Strip JSONC comments from string (simple implementation)
 * Handles // line comments and /* block comments
 */
function stripJsonComments(content: string): string {
  // Remove single-line comments (but not in strings)
  // Simple approach: just remove lines that start with // after trimming
  const lines = content.split('\n');
  const cleaned = lines
    .map((line) => {
      const trimmed = line.trim();
      // Skip full-line comments
      if (trimmed.startsWith('//')) return '';
      // Remove trailing comments (simple heuristic, may not be perfect)
      const commentIndex = line.indexOf('//');
      if (commentIndex > 0) {
        // Check if // is inside a string by counting quotes before it
        const beforeComment = line.substring(0, commentIndex);
        const doubleQuotes = (beforeComment.match(/"/g) || []).length;
        // If odd number of quotes, we're inside a string
        if (doubleQuotes % 2 === 0) {
          return line.substring(0, commentIndex);
        }
      }
      return line;
    })
    .join('\n');

  // Remove block comments /* ... */
  return cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Safely parse JSON with JSONC support and error handling
 */
function safeParseJson<T>(content: string, filePath: string): T | null {
  try {
    const stripped = stripJsonComments(content);
    return JSON.parse(stripped) as T;
  } catch (error) {
    console.error(`Warning: Failed to parse config file '${filePath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Load config from a specific file path
 */
function loadConfigFile(filePath: string): Partial<Config> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return safeParseJson<Partial<Config>>(content, filePath);
  } catch (error) {
    console.error(`Warning: Failed to read config file '${filePath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Resolve API key for a provider with full priority chain:
 * 1. Environment variables (highest)
 * 2. Auth storage (multi-account support)
 * 3. Provider config with variable substitution
 * 4. Legacy apiKey field
 */
function resolveApiKey(
  provider: SupportedProvider,
  config: Partial<Config>
): string | undefined {
  // 1. Environment variable (highest priority)
  const envKey = ENV_KEY_MAP[provider];
  const envValue = process.env[envKey];
  if (envValue) return envValue;

  // 2. Auth storage (supports multi-account)
  const auth = getAuth(provider);
  if (auth) {
    if (auth.type === 'api' && auth.key) return auth.key;
    if (auth.type === 'oauth' && auth.access) return auth.access;
  }

  // 3. Provider config with variable substitution
  const providerConfig = config.providers?.[provider];
  if (providerConfig?.apiKey) {
    const resolved = resolveConfigValue(providerConfig.apiKey);
    if (resolved) return resolved;
  }

  // 4. Legacy apiKey field
  if (config.apiKey) {
    const resolved = resolveConfigValue(config.apiKey);
    if (resolved) return resolved;
  }

  return undefined;
}

/**
 * Load configuration with 3-tier hierarchy:
 * 1. Built-in defaults (lowest)
 * 2. Global config (~/.config/nano-opencode/config.json)
 * 3. Project config (.nano-opencode/config.json) (highest)
 */
export function loadConfig(): Config {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Layer 2: Global config
  const globalConfig = loadConfigFile(GLOBAL_CONFIG_FILE);
  if (globalConfig) {
    config = mergeConfigs(config, globalConfig);
  }

  // Layer 3: Project config (highest priority for file-based)
  const projectConfigPath = join(process.cwd(), PROJECT_CONFIG_FILE);
  const projectConfig = loadConfigFile(projectConfigPath);
  if (projectConfig) {
    config = mergeConfigs(config, projectConfig);
  }

  // Determine provider from config or environment
  let detectedProvider: SupportedProvider = config.provider;

  // Check environment variables to auto-detect provider
  if (process.env.ANTHROPIC_API_KEY) {
    detectedProvider = 'anthropic';
  } else if (process.env.OPENAI_API_KEY) {
    detectedProvider = 'openai';
  } else if (process.env.GEMINI_API_KEY) {
    detectedProvider = 'gemini';
  }

  // Apply provider-specific defaults if needed
  if (detectedProvider !== config.provider) {
    config.provider = detectedProvider;
    // Update model to provider default if still using wrong provider's model
    if (config.model === DEFAULT_CONFIG.model && detectedProvider !== 'anthropic') {
      config.model = DEFAULT_MODELS[detectedProvider];
    }
  }

  // Resolve API key
  config.apiKey = resolveApiKey(config.provider, config);

  return config;
}

/**
 * Merge two config objects (source overrides target for defined values)
 */
function mergeConfigs(target: Config, source: Partial<Config>): Config {
  const result = { ...target };

  // Simple field overwrites
  if (source.provider !== undefined) result.provider = source.provider;
  if (source.model !== undefined) result.model = source.model;
  if (source.maxTokens !== undefined) result.maxTokens = source.maxTokens;
  if (source.temperature !== undefined) result.temperature = source.temperature;
  if (source.apiKey !== undefined) result.apiKey = source.apiKey;

  // Merge nested objects
  if (source.providers) {
    result.providers = { ...result.providers, ...source.providers };
  }
  if (source.agents) {
    result.agents = { ...result.agents, ...source.agents };
  }
  if (source.categories) {
    result.categories = { ...result.categories, ...source.categories };
  }
  if (source.experimental) {
    result.experimental = { ...result.experimental, ...source.experimental };
  }

  return result;
}

/**
 * Save config to global config file
 */
export function saveConfig(config: Partial<Config>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Load existing config to merge
  let existing: Partial<Config> = {};
  if (existsSync(GLOBAL_CONFIG_FILE)) {
    const content = readFileSync(GLOBAL_CONFIG_FILE, 'utf-8');
    const parsed = safeParseJson<Partial<Config>>(content, GLOBAL_CONFIG_FILE);
    if (parsed) {
      existing = parsed;
    }
  }

  // Merge and save
  const merged = { ...existing, ...config };

  // Don't save resolved apiKey (security)
  delete merged.apiKey;

  writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(merged, null, 2));
}

/**
 * Save provider configuration
 */
export function saveProviderConfig(provider: string, providerConfig: ProviderConfig): void {
  const config = loadConfigFile(GLOBAL_CONFIG_FILE) || {};
  config.providers = config.providers || {};
  config.providers[provider] = providerConfig;
  saveConfig(config);
}

/**
 * Get global config file path
 */
export function getConfigPath(): string {
  return GLOBAL_CONFIG_FILE;
}

/**
 * Get project config file path (may not exist)
 */
export function getProjectConfigPath(): string {
  return join(process.cwd(), PROJECT_CONFIG_FILE);
}

/**
 * Check if project config exists
 */
export function hasProjectConfig(): boolean {
  return existsSync(getProjectConfigPath());
}

/**
 * Initialize project config with defaults
 */
export function initProjectConfig(): void {
  const projectDir = join(process.cwd(), '.nano-opencode');
  const projectFile = join(projectDir, 'config.json');

  if (existsSync(projectFile)) {
    console.log('Project config already exists.');
    return;
  }

  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  const defaultProjectConfig = {
    // Project-specific overrides go here
  };

  writeFileSync(projectFile, JSON.stringify(defaultProjectConfig, null, 2));
  console.log(`Created project config at ${projectFile}`);
}
