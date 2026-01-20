import { glob } from 'glob';
import { stat } from 'fs/promises';
import { resolve } from 'path';
import type { Tool } from '../types.js';
import { getErrorMessage, EXCLUDED_GLOB_PATTERNS } from '../constants.js';

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.js"). Returns matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match files against',
      },
      path: {
        type: 'string',
        description: 'The directory to search in. Default is current directory.',
      },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const pattern = args.pattern as string;
    const searchPath = resolve(process.cwd(), (args.path as string) || '.');

    try {
      const matches = await glob(pattern, {
        cwd: searchPath,
        ignore: EXCLUDED_GLOB_PATTERNS,
        nodir: true,
      });

      if (matches.length === 0) {
        return 'No files found matching the pattern.';
      }

      // Get stats for all files in parallel (async)
      const withStats = await Promise.all(
        matches.map(async (file) => {
          try {
            const fullPath = resolve(searchPath, file);
            const fileStat = await stat(fullPath);
            return { file, mtime: fileStat.mtime };
          } catch {
            // File may have been deleted between glob and stat
            return { file, mtime: new Date(0) };
          }
        })
      );

      // Sort by modification time (most recent first)
      withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      const result = withStats.map((f) => f.file).join('\n');
      return `Found ${matches.length} file(s):\n${result}`;
    } catch (error) {
      return `Error searching files: ${getErrorMessage(error)}`;
    }
  },
};
