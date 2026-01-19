import { spawn } from 'child_process';
import type { Tool } from '../types.js';

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
        description: 'Timeout in milliseconds. Default is 60000 (60 seconds).',
      },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 60000;

    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: process.cwd(),
        env: process.env,
        timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        let result = '';

        if (stdout) {
          result += stdout;
        }

        if (stderr) {
          result += (result ? '\n' : '') + `stderr:\n${stderr}`;
        }

        if (code !== 0) {
          result += (result ? '\n' : '') + `Exit code: ${code}`;
        }

        resolve(result || '(no output)');
      });

      proc.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });

      // Handle timeout
      setTimeout(() => {
        proc.kill('SIGTERM');
      }, timeout);
    });
  },
};
