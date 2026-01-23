// Shared constants for nano-opencode

// Timeouts
export const DEFAULT_BASH_TIMEOUT_MS = 60000; // 60 seconds
export const MAX_BASH_TIMEOUT_MS = 600000; // 10 minutes

// Search limits
export const DEFAULT_GREP_MAX_RESULTS = 50;
export const DEFAULT_GLOB_MAX_RESULTS = 1000;

// Directories to exclude from searches
export const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.mypy_cache',
  '.pytest_cache',
] as const;

// Glob patterns for exclusion (used by glob tool)
export const EXCLUDED_GLOB_PATTERNS = EXCLUDED_DIRS.map((dir) => `**/${dir}/**`);

// Ripgrep glob patterns for exclusion
export const EXCLUDED_RG_PATTERNS = EXCLUDED_DIRS.map((dir) => `!${dir}`);

// Grep --exclude-dir patterns
export const EXCLUDED_GREP_DIRS = EXCLUDED_DIRS.map((dir) => `--exclude-dir=${dir}`);

// Supported providers
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// Environment variable names for API keys (ollama doesn't need one)
export const ENV_KEY_MAP: Record<SupportedProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: 'OLLAMA_HOST', // Optional: defaults to localhost:11434
};

// Default models per provider
export const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  ollama: 'llama3.2',
};

export function getSystemPrompt(): string {
  return `You are nano-opencode, a helpful AI coding assistant running in the terminal.

You have access to tools to help users with software engineering tasks:
- Read, write, and edit files
- Execute shell commands
- Search code with glob patterns and grep

Guidelines:
- Be concise and direct
- Use tools to complete tasks rather than just describing what to do
- When editing files, read them first to understand the context
- Execute commands to verify your changes work
- If unsure about something, ask the user for clarification

Current working directory: ${process.cwd()}`;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
