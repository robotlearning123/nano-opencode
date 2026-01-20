/**
 * Utility functions for nano-opencode
 * - Path validation (security)
 * - Dangerous command detection
 * - Config variable substitution (OpenCode pattern)
 */

import { resolve, normalize, isAbsolute, sep } from 'path';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Dangerous command patterns for bash warnings
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; warning: string }> = [
  // Filesystem destruction
  { pattern: /\brm\s+(-[a-zA-Z]*)?-rf?\s+\/(?!\S)/, warning: 'Deleting from root filesystem' },
  { pattern: /\brm\s+(-[a-zA-Z]*)?-rf?\s+~\//, warning: 'Recursively deleting home directory' },
  { pattern: /\brm\s+(-[a-zA-Z]*)?-rf?\s+\*/, warning: 'Deleting all files in directory' },
  { pattern: /\brm\s+(-[a-zA-Z]*)?-rf?\s+\.\.\//, warning: 'Deleting from parent directory' },

  // System destruction
  { pattern: /\bmkfs\b/, warning: 'Formatting filesystem' },
  { pattern: /\bdd\s+.*of=\/dev\//, warning: 'Writing directly to device' },
  { pattern: />\s*\/dev\/(sda|hda|nvme|disk)/, warning: 'Overwriting disk device' },

  // Forkbombs and resource exhaustion
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, warning: 'Fork bomb detected' },
  { pattern: /while\s+true.*do.*done/, warning: 'Infinite loop detected' },

  // Permission/ownership changes
  { pattern: /\bchmod\s+(-[a-zA-Z]*\s+)?777\s+\//, warning: 'Setting world-writable on root' },
  { pattern: /\bchown\s+.*\s+\/(?!\S)/, warning: 'Changing ownership of root' },

  // Network exfiltration
  { pattern: /curl.*\|\s*(ba)?sh/, warning: 'Piping curl output to shell' },
  { pattern: /wget.*\|\s*(ba)?sh/, warning: 'Piping wget output to shell' },

  // History/log destruction
  { pattern: />\s*\/dev\/null\s*2>&1\s*&/, warning: 'Running silently in background' },
  { pattern: /history\s+-c/, warning: 'Clearing command history' },
  { pattern: /shred.*\/var\/log/, warning: 'Shredding system logs' },

  // Credential exposure
  { pattern: /cat.*\/etc\/shadow/, warning: 'Reading password hashes' },
  { pattern: /echo.*\|\s*sudo\s+-S/, warning: 'Passing password to sudo via echo' },
];

/**
 * Validate that a path is within the current working directory
 * Prevents path traversal attacks (../../etc/passwd)
 *
 * @throws Error if path attempts to escape cwd
 */
export function validatePathWithinCwd(inputPath: string): string {
  const cwd = process.cwd();

  // Handle absolute paths
  let resolvedPath: string;
  if (isAbsolute(inputPath)) {
    resolvedPath = normalize(inputPath);
  } else {
    resolvedPath = resolve(cwd, inputPath);
  }

  // Normalize to handle /../ sequences
  resolvedPath = normalize(resolvedPath);

  // Check if the resolved path starts with cwd
  // Allow exact match or path starting with cwd + separator
  const normalizedCwd = normalize(cwd);
  if (!resolvedPath.startsWith(normalizedCwd + sep) && resolvedPath !== normalizedCwd) {
    throw new Error(
      `Path traversal detected: '${inputPath}' resolves to '${resolvedPath}' which is outside the working directory '${normalizedCwd}'`
    );
  }

  return resolvedPath;
}

/**
 * Check a command for dangerous patterns
 * Returns array of warning messages (empty if safe)
 */
export function checkDangerousCommand(command: string): string[] {
  const warnings: string[] = [];

  for (const { pattern, warning } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(warning);
    }
  }

  return warnings;
}

/**
 * Format dangerous command warnings for display
 */
export function formatCommandWarnings(warnings: string[]): string {
  if (warnings.length === 0) return '';

  return warnings.map((w) => `[WARNING: ${w}]`).join('\n') + '\n';
}

/**
 * Resolve config value with variable substitution
 * Supports OpenCode patterns:
 * - {env:VARIABLE_NAME} - environment variable
 * - {file:/path/to/file} or {file:~/path} - file content
 */
export function resolveConfigValue(value: string | undefined): string | undefined {
  if (!value) return undefined;

  // {env:VARIABLE_NAME}
  if (value.startsWith('{env:') && value.endsWith('}')) {
    const varName = value.slice(5, -1);
    return process.env[varName] || undefined;
  }

  // {file:path}
  if (value.startsWith('{file:') && value.endsWith('}')) {
    const filePath = value.slice(6, -1).replace(/^~/, homedir());
    try {
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8').trim();
      }
    } catch {
      // Fall through to return undefined
    }
    return undefined;
  }

  return value;
}

/**
 * Expand all variable references in a string
 * Handles inline variables: "prefix {env:VAR} suffix"
 */
export function expandVariables(value: string): string {
  // Handle {env:VAR} patterns
  value = value.replace(/\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });

  // Handle {file:path} patterns
  value = value.replace(/\{file:([^}]+)\}/g, (_, filePath) => {
    const expandedPath = filePath.replace(/^~/, homedir());
    try {
      if (existsSync(expandedPath)) {
        return readFileSync(expandedPath, 'utf-8').trim();
      }
    } catch {
      // Return empty on error
    }
    return '';
  });

  return value;
}

/**
 * Mask sensitive values for display (e.g., API keys)
 */
export function maskSensitiveValue(value: string, visibleChars = 8): string {
  if (!value || value.length <= visibleChars) {
    return '***';
  }
  return value.substring(0, visibleChars) + '...';
}

/**
 * Parse a provider/model string like "anthropic/claude-sonnet-4-5"
 * Returns [provider, model] or [undefined, original] if no slash
 */
export function parseProviderModel(value: string): [string | undefined, string] {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    return [undefined, value];
  }
  return [value.substring(0, slashIndex), value.substring(slashIndex + 1)];
}
