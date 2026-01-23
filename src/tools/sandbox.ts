/**
 * Sandbox Tool - Run commands in an isolated environment
 *
 * Provides safe command execution with resource limits and isolation.
 */

import type { Tool } from '../types.js';
import { runInSandbox, getSandboxInfo } from '../sandbox/index.js';

export const sandboxTool: Tool = {
  name: 'sandbox',
  description:
    'Run a command in an isolated sandbox with resource limits. Use for untrusted code or when you need memory/time limits. Returns stdout, stderr, and execution info.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute in the sandbox',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
      memory: {
        type: 'string',
        description: 'Memory limit (e.g., "256m", "1g"). Default: 512m',
      },
      network: {
        type: 'boolean',
        description: 'Allow network access (default: false)',
      },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 30000;
    const maxMemory = (args.memory as string) || '512m';
    const network = Boolean(args.network);

    if (!command) {
      return 'Error: Command is required';
    }

    try {
      const result = await runInSandbox(command, {
        timeout,
        maxMemory,
        network,
        cwd: process.cwd(),
      });

      const parts: string[] = [];

      // Add backend info
      parts.push(`[sandbox: ${result.backend}]`);

      if (result.killed) {
        parts.push('[timeout exceeded]');
      }

      if (result.stdout) {
        parts.push(result.stdout);
      }

      if (result.stderr) {
        parts.push(`stderr:\n${result.stderr}`);
      }

      if (result.exitCode !== 0) {
        parts.push(`Exit code: ${result.exitCode}`);
      }

      return parts.join('\n') || '(no output)';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Sandbox execution failed'}`;
    }
  },
};

export const sandboxInfoTool: Tool = {
  name: 'sandbox_info',
  description: 'Get information about available sandbox backends (Docker, Firejail, or direct)',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => {
    const info = getSandboxInfo();

    return `Sandbox backends:
- Docker: ${info.docker ? '✓ available' : '✗ not found'}
- Firejail: ${info.firejail ? '✓ available' : '✗ not found'}
- Recommended: ${info.recommended}

Note: Docker provides the best isolation. Firejail is Linux-only.
Direct mode uses ulimit for basic resource limits.`;
  },
};
