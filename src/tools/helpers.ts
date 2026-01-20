/**
 * Common helpers for tools
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getErrorMessage } from '../constants.js';
import { validatePathWithinCwd } from '../utils.js';

/**
 * Result of path validation - either the resolved path or an error message
 */
export type PathResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Validate and resolve a file path within cwd
 * Returns either the resolved path or an error message
 */
export function validatePath(inputPath: string): PathResult {
  try {
    const filePath = validatePathWithinCwd(inputPath);
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: `Error: ${getErrorMessage(error)}` };
  }
}

/**
 * Validate path and check file exists
 */
export function validatePathExists(inputPath: string): PathResult {
  const result = validatePath(inputPath);
  if (!result.ok) return result;

  if (!existsSync(result.path)) {
    return { ok: false, error: `Error: File not found: ${result.path}` };
  }
  return result;
}

/**
 * Options for running a spawned command
 */
export interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  timeout?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Result of a spawned command
 */
export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  killed: boolean;
}

/**
 * Run a command with spawn and collect output
 * Returns a promise that resolves with the result
 */
export function runSpawn(options: SpawnOptions): Promise<SpawnResult> {
  const { command, args, cwd = process.cwd(), timeout, onStdout, onStderr } = options;

  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, env: process.env });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timeoutId: NodeJS.Timeout | undefined;

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      onStdout?.(str);
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      onStderr?.(str);
    });

    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout, stderr, exitCode: code, killed });
    });

    proc.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout, stderr: error.message, exitCode: -1, killed: false });
    });

    if (timeout) {
      timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 1000);
      }, timeout);
    }
  });
}

/**
 * Parse line and column from string arguments (for LSP tools)
 * Converts from 1-based (user) to 0-based (LSP)
 */
export function parsePosition(line: string, column: string): { line: number; column: number } {
  return {
    line: parseInt(line, 10) - 1,
    column: parseInt(column, 10) - 1,
  };
}
