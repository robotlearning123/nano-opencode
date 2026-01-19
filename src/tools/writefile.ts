import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';

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
    const filePath = resolve(process.cwd(), args.path as string);
    const content = args.content as string;

    try {
      // Create directory if it doesn't exist
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, content, 'utf-8');

      const lines = content.split('\n').length;
      return `Successfully wrote ${lines} lines to ${filePath}`;
    } catch (error) {
      return `Error writing file: ${getErrorMessage(error)}`;
    }
  },
};
