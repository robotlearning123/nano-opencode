import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';
import { validatePath } from './helpers.js';

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist, or overwrites it if it does.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write (relative or absolute)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (args) => {
    const pathResult = validatePath(args.path as string);
    if (!pathResult.ok) return pathResult.error;

    const content = args.content as string;

    try {
      const dir = dirname(pathResult.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(pathResult.path, content, 'utf-8');
      return `Successfully wrote ${content.split('\n').length} lines to ${pathResult.path}`;
    } catch (error) {
      return `Error writing file: ${getErrorMessage(error)}`;
    }
  },
};
