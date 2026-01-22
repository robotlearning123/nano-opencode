/**
 * Patch Tool - atomic multi-file edits
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { Tool } from '../types.js';
import { validatePath } from './helpers.js';

interface PatchOperation {
  file: string;
  action: 'create' | 'edit' | 'delete';
  content?: string; // For create
  oldString?: string; // For edit
  newString?: string; // For edit
}

export const patchTool: Tool = {
  name: 'patch',
  description: 'Apply multiple file operations atomically. All operations succeed or none do.',
  parameters: {
    type: 'object',
    properties: {
      operations: {
        type: 'string',
        description: 'JSON array of operations: [{file, action, content?, oldString?, newString?}]',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, validate operations without applying them',
      },
    },
    required: ['operations'],
  },
  execute: async (args) => {
    const dryRun = (args.dryRun as boolean) || false;
    let operations: PatchOperation[];

    try {
      operations = JSON.parse(args.operations as string);
    } catch {
      return 'Error: Invalid JSON in operations parameter';
    }

    if (!Array.isArray(operations) || operations.length === 0) {
      return 'Error: operations must be a non-empty array';
    }

    // Validation phase - check all operations before applying any
    const errors: string[] = [];
    const backups: Map<string, string> = new Map();
    const validatedPaths: Map<number, string> = new Map(); // Index -> validated path

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const prefix = `Operation ${i + 1} (${op.file})`;

      if (!op.file || typeof op.file !== 'string') {
        errors.push(`${prefix}: missing file path`);
        continue;
      }

      // Validate path is within cwd (security)
      const pathResult = validatePath(op.file);
      if (!pathResult.ok) {
        errors.push(`${prefix}: ${pathResult.error}`);
        continue;
      }
      const validatedPath = pathResult.path;
      validatedPaths.set(i, validatedPath);

      if (!op.action || !['create', 'edit', 'delete'].includes(op.action)) {
        errors.push(`${prefix}: invalid action (must be create, edit, or delete)`);
        continue;
      }

      const exists = existsSync(validatedPath);

      switch (op.action) {
        case 'create':
          if (exists) {
            errors.push(`${prefix}: file already exists`);
          }
          if (!op.content && op.content !== '') {
            errors.push(`${prefix}: content required for create`);
          }
          break;

        case 'edit':
          if (!exists) {
            errors.push(`${prefix}: file does not exist`);
          } else {
            // Check that oldString exists in file
            if (!op.oldString) {
              errors.push(`${prefix}: oldString required for edit`);
            } else {
              const content = readFileSync(validatedPath, 'utf-8');
              backups.set(validatedPath, content);
              if (!content.includes(op.oldString)) {
                errors.push(`${prefix}: oldString not found in file`);
              }
            }
          }
          if (op.newString === undefined) {
            errors.push(`${prefix}: newString required for edit`);
          }
          break;

        case 'delete':
          if (!exists) {
            errors.push(`${prefix}: file does not exist`);
          } else {
            backups.set(validatedPath, readFileSync(validatedPath, 'utf-8'));
          }
          break;
      }
    }

    if (errors.length > 0) {
      return `Validation failed:\n${errors.join('\n')}`;
    }

    if (dryRun) {
      return `Dry run: ${operations.length} operations validated successfully`;
    }

    // Application phase - apply all operations using validated paths
    const applied: string[] = [];
    try {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const filePath = validatedPaths.get(i)!;

        switch (op.action) {
          case 'create': {
            const dir = dirname(filePath);
            if (dir && !existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            writeFileSync(filePath, op.content!, 'utf-8');
            applied.push(`Created: ${filePath}`);
            break;
          }

          case 'edit': {
            const content = backups.get(filePath)!;
            const newContent = content.replace(op.oldString!, op.newString!);
            writeFileSync(filePath, newContent, 'utf-8');
            applied.push(`Edited: ${filePath}`);
            break;
          }

          case 'delete': {
            const fs = await import('fs/promises');
            await fs.unlink(filePath);
            applied.push(`Deleted: ${filePath}`);
            break;
          }
        }
      }

      return `Patch applied successfully:\n${applied.join('\n')}`;
    } catch (error) {
      // Rollback on failure
      const rollbackErrors: string[] = [];
      for (const [file, content] of backups) {
        try {
          writeFileSync(file, content, 'utf-8');
        } catch {
          rollbackErrors.push(`Failed to restore ${file}`);
        }
      }

      let message = `Error during patch: ${error instanceof Error ? error.message : String(error)}`;
      if (rollbackErrors.length > 0) {
        message += `\nRollback issues: ${rollbackErrors.join(', ')}`;
      } else {
        message += '\nChanges were rolled back.';
      }
      return message;
    }
  },
};
