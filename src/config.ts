import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config } from './types.js';

const CONFIG_DIR = join(homedir(), '.config', 'nano-opencode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
};

export function loadConfig(): Config {
  // Check environment variables first
  const envConfig: Partial<Config> = {};

  if (process.env.ANTHROPIC_API_KEY) {
    envConfig.provider = 'anthropic';
    envConfig.apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    envConfig.provider = 'openai';
    envConfig.apiKey = process.env.OPENAI_API_KEY;
    envConfig.model = 'gpt-4o';
  }

  // Load from config file if exists
  let fileConfig: Partial<Config> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  return { ...DEFAULT_CONFIG, ...fileConfig, ...envConfig };
}

export function saveConfig(config: Partial<Config>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const existing = existsSync(CONFIG_FILE)
    ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    : {};

  writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
