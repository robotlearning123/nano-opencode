import { spawn } from 'child_process';
import type { Tool } from '../types.js';
import { DEFAULT_BASH_TIMEOUT_MS, MAX_BASH_TIMEOUT_MS } from '../constants.js';
import { checkDangerousCommand, formatCommandWarnings } from '../utils.js';

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command. Returns stdout and stderr. Use for git, npm, build commands, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: `Timeout in milliseconds. Default is ${DEFAULT_BASH_TIMEOUT_MS} (${DEFAULT_BASH_TIMEOUT_MS / 1000} seconds). Max is ${MAX_BASH_TIMEOUT_MS}.`,
      },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const command = args.command as string;

    // Use ?? instead of || to allow timeout: 0 (though it would be silly)
    let timeout = (args.timeout as number) ?? DEFAULT_BASH_TIMEOUT_MS;

    // Cap timeout to max
    if (timeout > MAX_BASH_TIMEOUT_MS) {
      timeout = MAX_BASH_TIMEOUT_MS;
    }

    // Check for dangerous commands and generate warnings
    const warnings = checkDangerousCommand(command);
    const warningPrefix = formatCommandWarnings(warnings);

    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: process.cwd(),
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      let timeoutId: NodeJS.Timeout | undefined;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      proc.on('close', (code) => {
        // Clear timeout on any completion
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        const parts: string[] = [];

        // Add warnings first
        if (warningPrefix) {
          parts.push(warningPrefix.trim());
        }

        // Add timeout message if killed
        if (killed) {
          parts.push('[Command killed: timeout exceeded]');
        }

        if (stdout) parts.push(stdout);
        if (stderr) parts.push(`stderr:\n${stderr}`);
        if (code !== 0 && code !== null) parts.push(`Exit code: ${code}`);

        resolve(parts.join('\n') || '(no output)');
      });

      // Handle spawn errors (command not found, etc.)
      proc.on('error', (error) => {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        const parts: string[] = [];
        if (warningPrefix) {
          parts.push(warningPrefix.trim());
        }
        parts.push(`Error: ${error.message}`);
        resolve(parts.join('\n'));
      });

      // Set up timeout
      timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');

        // Give it a moment to terminate gracefully, then SIGKILL
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);
    });
  },
};
