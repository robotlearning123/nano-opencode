/**
 * Diff Tool - simple unified diff for comparing files/content
 */

import { readFileSync, existsSync } from 'fs';
import type { Tool } from '../types.js';
import { validatePathExists } from './helpers.js';

/**
 * Simple unified diff implementation
 */
function unifiedDiff(oldLines: string[], newLines: string[], oldName: string, newName: string): string {
  const result: string[] = [];
  result.push(`--- ${oldName}`);
  result.push(`+++ ${newName}`);

  // Simple LCS-based diff
  const hunks = computeHunks(oldLines, newLines);

  for (const hunk of hunks) {
    result.push(`@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`);
    for (const line of hunk.lines) {
      result.push(line);
    }
  }

  return result.join('\n');
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function computeHunks(oldLines: string[], newLines: string[], context = 3): Hunk[] {
  const hunks: Hunk[] = [];
  const changes = computeChanges(oldLines, newLines);

  let i = 0;
  while (i < changes.length) {
    // Find start of changed region
    while (i < changes.length && changes[i].type === 'same') i++;
    if (i >= changes.length) break;

    // Build hunk with context
    const hunkStart = Math.max(0, i - context);
    const hunk: Hunk = {
      oldStart: 0,
      oldCount: 0,
      newStart: 0,
      newCount: 0,
      lines: [],
    };

    // Add leading context
    let oldIdx = 0, newIdx = 0;
    for (let j = 0; j < hunkStart; j++) {
      if (changes[j].type === 'same' || changes[j].type === 'remove') oldIdx++;
      if (changes[j].type === 'same' || changes[j].type === 'add') newIdx++;
    }
    hunk.oldStart = oldIdx;
    hunk.newStart = newIdx;

    for (let j = hunkStart; j < i; j++) {
      if (changes[j].type === 'same') {
        hunk.lines.push(` ${changes[j].content}`);
        hunk.oldCount++;
        hunk.newCount++;
      }
    }

    // Add changes and trailing context
    let lastChangeIdx = i;
    while (i < changes.length) {
      const c = changes[i];
      if (c.type === 'same') {
        // Check if there are more changes within context range
        let hasMore = false;
        for (let j = i + 1; j <= i + context * 2 && j < changes.length; j++) {
          if (changes[j].type !== 'same') { hasMore = true; break; }
        }
        if (!hasMore && i - lastChangeIdx >= context) break;
        hunk.lines.push(` ${c.content}`);
        hunk.oldCount++;
        hunk.newCount++;
      } else if (c.type === 'remove') {
        hunk.lines.push(`-${c.content}`);
        hunk.oldCount++;
        lastChangeIdx = i;
      } else if (c.type === 'add') {
        hunk.lines.push(`+${c.content}`);
        hunk.newCount++;
        lastChangeIdx = i;
      }
      i++;
    }

    if (hunk.lines.some(l => l.startsWith('+') || l.startsWith('-'))) {
      hunks.push(hunk);
    }
  }

  return hunks;
}

interface Change {
  type: 'same' | 'add' | 'remove';
  content: string;
}

function computeChanges(oldLines: string[], newLines: string[]): Change[] {
  // Simple diff using longest common subsequence
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find changes
  const changes: Change[] = [];
  let i = m, j = n;
  const temp: Change[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'same', content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: 'add', content: newLines[j - 1] });
      j--;
    } else {
      temp.push({ type: 'remove', content: oldLines[i - 1] });
      i--;
    }
  }

  return temp.reverse();
}

/**
 * diff - Compare two files or content
 */
export const diffTool: Tool = {
  name: 'diff',
  description: 'Show differences between two files or between file and provided content. Returns unified diff format.',
  parameters: {
    type: 'object',
    properties: {
      file1: { type: 'string', description: 'First file path (or "old" content if content1 provided)' },
      file2: { type: 'string', description: 'Second file path (optional if content2 provided)' },
      content1: { type: 'string', description: 'Old content to compare (instead of file1)' },
      content2: { type: 'string', description: 'New content to compare (instead of file2)' },
    },
    required: [],
  },
  execute: async (args): Promise<string> => {
    let oldContent: string;
    let newContent: string;
    let oldName: string;
    let newName: string;

    // Get old content
    if (args.content1) {
      oldContent = args.content1 as string;
      oldName = 'a/content';
    } else if (args.file1) {
      const result = validatePathExists(args.file1 as string);
      if (!result.ok) return result.error;
      oldContent = readFileSync(result.path, 'utf-8');
      oldName = `a/${args.file1}`;
    } else {
      return 'Must provide either file1 or content1';
    }

    // Get new content
    if (args.content2) {
      newContent = args.content2 as string;
      newName = 'b/content';
    } else if (args.file2) {
      const result = validatePathExists(args.file2 as string);
      if (!result.ok) return result.error;
      newContent = readFileSync(result.path, 'utf-8');
      newName = `b/${args.file2}`;
    } else {
      return 'Must provide either file2 or content2';
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    if (oldContent === newContent) {
      return 'Files are identical';
    }

    return unifiedDiff(oldLines, newLines, oldName, newName);
  },
};
