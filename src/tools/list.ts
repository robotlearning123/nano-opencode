import { readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import type { Tool } from '../types.js';

export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List contents of a directory. Shows files and directories with their sizes.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list. Default is current directory.',
      },
      show_hidden: {
        type: 'boolean',
        description: 'Show hidden files (starting with .). Default is false.',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const dirPath = resolve(process.cwd(), (args.path as string) || '.');
    const showHidden = (args.show_hidden as boolean) ?? false;

    try {
      const entries = readdirSync(dirPath);

      const items: Array<{ name: string; type: string; size?: number }> = [];

      for (const entry of entries) {
        if (!showHidden && entry.startsWith('.')) {
          continue;
        }

        const fullPath = join(dirPath, entry);
        try {
          const stat = statSync(fullPath);
          items.push({
            name: entry,
            type: stat.isDirectory() ? 'dir' : 'file',
            size: stat.isFile() ? stat.size : undefined,
          });
        } catch {
          items.push({ name: entry, type: 'unknown' });
        }
      }

      // Sort: directories first, then files
      items.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });

      if (items.length === 0) {
        return `Directory ${dirPath} is empty.`;
      }

      const formatSize = (bytes?: number) => {
        if (bytes === undefined) return '';
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
        return `${(bytes / 1024 / 1024).toFixed(1)}M`;
      };

      const lines = items.map((item) => {
        const prefix = item.type === 'dir' ? '📁' : '📄';
        const size = item.size !== undefined ? ` (${formatSize(item.size)})` : '';
        const suffix = item.type === 'dir' ? '/' : '';
        return `${prefix} ${item.name}${suffix}${size}`;
      });

      return `Contents of ${dirPath}:\n${lines.join('\n')}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error listing directory: ${message}`;
    }
  },
};
