/**
 * Undo Tool - file backup and revert functionality
 * Keeps backups before write/edit operations for safe rollback
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import type { Tool } from '../types.js';

// Backup storage location
const BACKUP_DIR = join(homedir(), '.config', 'nano-opencode', 'backups');
const MAX_BACKUPS_PER_FILE = 10;
const MAX_TOTAL_BACKUPS = 100;

// In-memory backup registry for current session
interface BackupEntry {
  originalPath: string;
  backupPath: string;
  timestamp: number;
  operation: 'write' | 'edit';
}

const sessionBackups: BackupEntry[] = [];

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Generate backup filename
 */
function getBackupPath(originalPath: string): string {
  const timestamp = Date.now();
  const safeName = originalPath.replace(/[\/\\:]/g, '_').slice(-100);
  return join(BACKUP_DIR, `${timestamp}_${safeName}`);
}

/**
 * Create a backup before file modification
 */
export function createBackup(filePath: string, operation: 'write' | 'edit'): string | null {
  ensureBackupDir();

  // Only backup existing files
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const backupPath = getBackupPath(filePath);

    writeFileSync(backupPath, content, 'utf-8');

    const entry: BackupEntry = {
      originalPath: filePath,
      backupPath,
      timestamp: Date.now(),
      operation,
    };

    sessionBackups.unshift(entry);

    // Cleanup old backups
    cleanupBackups();

    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Restore from the most recent backup of a file
 */
export function restoreBackup(filePath: string): { success: boolean; message: string } {
  // Find most recent backup for this file
  const backup = sessionBackups.find((b) => b.originalPath === filePath);

  if (!backup) {
    return { success: false, message: `No backup found for ${filePath}` };
  }

  if (!existsSync(backup.backupPath)) {
    return { success: false, message: 'Backup file no longer exists' };
  }

  try {
    const content = readFileSync(backup.backupPath, 'utf-8');
    writeFileSync(filePath, content, 'utf-8');

    // Remove this backup from registry (one-time restore)
    const idx = sessionBackups.indexOf(backup);
    if (idx !== -1) {
      sessionBackups.splice(idx, 1);
    }

    return { success: true, message: `Restored ${filePath} from backup` };
  } catch (error) {
    return { success: false, message: `Failed to restore: ${error}` };
  }
}

/**
 * List available backups
 */
export function listBackups(filePath?: string): BackupEntry[] {
  if (filePath) {
    return sessionBackups.filter((b) => b.originalPath === filePath);
  }
  return [...sessionBackups];
}

/**
 * Cleanup old backups
 */
function cleanupBackups(): void {
  // Limit session backups
  while (sessionBackups.length > MAX_TOTAL_BACKUPS) {
    const old = sessionBackups.pop();
    if (old && existsSync(old.backupPath)) {
      try {
        unlinkSync(old.backupPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Clean up backup directory (keep MAX_TOTAL_BACKUPS files)
  try {
    const files = readdirSync(BACKUP_DIR)
      .map((f) => ({ name: f, path: join(BACKUP_DIR, f) }))
      .filter((f) => statSync(f.path).isFile())
      .sort((a, b) => {
        const aTime = parseInt(a.name.split('_')[0]) || 0;
        const bTime = parseInt(b.name.split('_')[0]) || 0;
        return bTime - aTime; // Newest first
      });

    // Remove excess files
    while (files.length > MAX_TOTAL_BACKUPS) {
      const old = files.pop();
      if (old) {
        try {
          unlinkSync(old.path);
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }
}

// Undo tool for reverting the last file change
export const undoTool: Tool = {
  name: 'undo',
  description: 'Revert the last file change. Shows available backups if no file specified.',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to restore. If omitted, lists available backups.',
      },
    },
    required: [],
  },
  execute: async (args): Promise<string> => {
    const filePath = args.file_path as string | undefined;

    if (!filePath) {
      // List available backups
      const backups = listBackups();
      if (backups.length === 0) {
        return 'No backups available in this session.';
      }

      const lines = ['Available backups:'];
      const seen = new Set<string>();

      for (const b of backups) {
        if (seen.has(b.originalPath)) continue;
        seen.add(b.originalPath);

        const age = Math.round((Date.now() - b.timestamp) / 1000);
        lines.push(`  - ${b.originalPath} (${age}s ago, ${b.operation})`);
      }

      return lines.join('\n');
    }

    const result = restoreBackup(filePath);
    return result.message;
  },
};

// List backups tool
export const listBackupsTool: Tool = {
  name: 'list_backups',
  description: 'List all file backups available for restoration',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Optional: filter backups for a specific file',
      },
    },
    required: [],
  },
  execute: async (args): Promise<string> => {
    const filePath = args.file_path as string | undefined;
    const backups = listBackups(filePath);

    if (backups.length === 0) {
      return filePath
        ? `No backups found for ${filePath}`
        : 'No backups available in this session.';
    }

    const lines = ['File backups:'];
    for (const b of backups) {
      const age = Math.round((Date.now() - b.timestamp) / 1000);
      lines.push(`  - ${b.originalPath}`);
      lines.push(`    Operation: ${b.operation}, ${age}s ago`);
    }

    return lines.join('\n');
  },
};
