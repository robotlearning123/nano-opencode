import { spawn } from 'child_process';
import type { Tool } from '../types.js';

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for a pattern in files using ripgrep (rg) or grep. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'The directory or file to search in. Default is current directory.',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}")',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Make the search case-insensitive. Default is false.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return. Default is 50.',
      },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || '.';
    const globPattern = args.glob as string | undefined;
    const caseInsensitive = (args.case_insensitive as boolean) ?? false;
    const maxResults = (args.max_results as number) || 50;

    return new Promise((resolve) => {
      // Try ripgrep first, fall back to grep
      const rgArgs = [
        '--line-number',
        '--no-heading',
        '--color=never',
        '-m', String(maxResults),
      ];

      if (caseInsensitive) {
        rgArgs.push('-i');
      }

      if (globPattern) {
        rgArgs.push('--glob', globPattern);
      }

      // Exclude common directories
      rgArgs.push('--glob', '!node_modules');
      rgArgs.push('--glob', '!.git');
      rgArgs.push('--glob', '!dist');
      rgArgs.push('--glob', '!build');

      rgArgs.push(pattern, searchPath);

      const proc = spawn('rg', rgArgs, {
        cwd: process.cwd(),
        env: process.env,
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
        if (code === 0 || code === 1) {
          // code 1 means no matches
          if (!stdout.trim()) {
            resolve('No matches found.');
          } else {
            const lines = stdout.trim().split('\n');
            resolve(`Found ${lines.length} match(es):\n${stdout.trim()}`);
          }
        } else {
          // ripgrep might not be installed, try grep
          resolve(fallbackGrep(pattern, searchPath, caseInsensitive, maxResults));
        }
      });

      proc.on('error', () => {
        // ripgrep not installed
        resolve(fallbackGrep(pattern, searchPath, caseInsensitive, maxResults));
      });
    });
  },
};

async function fallbackGrep(
  pattern: string,
  searchPath: string,
  caseInsensitive: boolean,
  maxResults: number
): Promise<string> {
  return new Promise((resolve) => {
    const grepArgs = [
      '-r',
      '-n',
      '--include=*.ts',
      '--include=*.js',
      '--include=*.tsx',
      '--include=*.jsx',
      '--include=*.json',
      '--include=*.md',
      '--exclude-dir=node_modules',
      '--exclude-dir=.git',
      '--exclude-dir=dist',
    ];

    if (caseInsensitive) {
      grepArgs.push('-i');
    }

    grepArgs.push(pattern, searchPath);

    const proc = spawn('grep', grepArgs, {
      cwd: process.cwd(),
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', () => {
      if (!stdout.trim()) {
        resolve('No matches found.');
      } else {
        const lines = stdout.trim().split('\n').slice(0, maxResults);
        resolve(`Found ${lines.length} match(es):\n${lines.join('\n')}`);
      }
    });

    proc.on('error', (error) => {
      resolve(`Error: ${error.message}`);
    });
  });
}
