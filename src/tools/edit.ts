import { readFileSync, writeFileSync } from 'fs';
import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';
import { validatePathExists } from './helpers.js';
import { createBackup } from './undo.js';

export const editFileTool: Tool = {
  name: 'edit_file',
  description:
    'Edit a file by replacing a specific string with another. The old_string must match exactly (including whitespace). Automatically creates a backup for undo.',
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
    const pathResult = validatePathExists(args.path as string);
    if (!pathResult.ok) return pathResult.error;

    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = (args.replace_all as boolean) ?? false;

    try {
      const content = readFileSync(pathResult.path, 'utf-8');

      if (!content.includes(oldString)) {
        return `Error: The specified old_string was not found in the file. Make sure it matches exactly, including whitespace and indentation.`;
      }

      const occurrences = content.split(oldString).length - 1;

      if (occurrences > 1 && !replaceAll) {
        return `Error: Found ${occurrences} occurrences of old_string. Use replace_all=true to replace all, or provide a more specific old_string.`;
      }

      const newContent = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      // Create backup before modifying
      createBackup(pathResult.path, 'edit');

      writeFileSync(pathResult.path, newContent, 'utf-8');
      return `Successfully replaced ${replaceAll ? occurrences : 1} occurrence(s) in ${pathResult.path}`;
    } catch (error) {
      return `Error editing file: ${getErrorMessage(error)}`;
    }
  },
};
