import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Tool } from '../types.js';

export const editFileTool: Tool = {
  name: 'edit_file',
  description: 'Edit a file by replacing a specific string with another. The old_string must match exactly (including whitespace).',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to edit (relative or absolute)',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'If true, replace all occurrences. Default is false (replace first only).',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: async (args) => {
    const filePath = resolve(process.cwd(), args.path as string);
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = args.replace_all as boolean || false;

    if (!existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');

      if (!content.includes(oldString)) {
        return `Error: The specified old_string was not found in the file. Make sure it matches exactly, including whitespace and indentation.`;
      }

      // Count occurrences
      const occurrences = content.split(oldString).length - 1;

      if (occurrences > 1 && !replaceAll) {
        return `Error: Found ${occurrences} occurrences of old_string. Use replace_all=true to replace all, or provide a more specific old_string.`;
      }

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        newContent = content.replace(oldString, newString);
      }

      writeFileSync(filePath, newContent, 'utf-8');

      const replacedCount = replaceAll ? occurrences : 1;
      return `Successfully replaced ${replacedCount} occurrence(s) in ${filePath}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error editing file: ${message}`;
    }
  },
};
