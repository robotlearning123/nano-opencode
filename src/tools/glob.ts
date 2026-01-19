import { glob } from 'glob';
import { statSync } from 'fs';
import { resolve } from 'path';
import type { Tool } from '../types.js';

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
        ignore: ['**/node_modules/**', '**/.git/**'],
        nodir: true,
      });

      if (matches.length === 0) {
        return 'No files found matching the pattern.';
      }

      // Sort by modification time (most recent first)
      const withStats = matches.map((file) => {
        try {
          const fullPath = resolve(searchPath, file);
          const stat = statSync(fullPath);
          return { file, mtime: stat.mtime };
        } catch {
          return { file, mtime: new Date(0) };
        }
      });

      withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      const result = withStats.map((f) => f.file).join('\n');
      return `Found ${matches.length} file(s):\n${result}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error searching files: ${message}`;
    }
  },
};
