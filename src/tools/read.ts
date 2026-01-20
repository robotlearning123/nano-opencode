import { readFileSync } from 'fs';
import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';
import { validatePathExists } from './helpers.js';

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content with line numbers.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read (relative or absolute)',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed). Optional.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read. Optional.',
      },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const pathResult = validatePathExists(args.path as string);
    if (!pathResult.ok) return pathResult.error;

    const offset = (args.offset as number) ?? 1;
    const limit = args.limit as number | undefined;

    try {
      const content = readFileSync(pathResult.path, 'utf-8');
      const lines = content.split('\n');

      const startLine = Math.max(0, offset - 1);
      const endLine = limit ? Math.min(startLine + limit, lines.length) : lines.length;
      const selectedLines = lines.slice(startLine, endLine);

      const formatted = selectedLines
        .map((line, i) => `${String(startLine + i + 1).padStart(4, ' ')}\t${line}`)
        .join('\n');

      return formatted || '(empty file)';
    } catch (error) {
      return `Error reading file: ${getErrorMessage(error)}`;
    }
  },
};
