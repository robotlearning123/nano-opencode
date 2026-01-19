import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';

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
    const filePath = resolve(process.cwd(), args.path as string);
    const offset = (args.offset as number) || 1;
    const limit = args.limit as number | undefined;

    if (!existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const startLine = Math.max(0, offset - 1);
      const endLine = limit ? Math.min(startLine + limit, lines.length) : lines.length;

      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers
      const formatted = selectedLines
        .map((line, i) => {
          const lineNum = startLine + i + 1;
          return `${String(lineNum).padStart(4, ' ')}\t${line}`;
        })
        .join('\n');

      return formatted || '(empty file)';
    } catch (error) {
      return `Error reading file: ${getErrorMessage(error)}`;
    }
  },
};
