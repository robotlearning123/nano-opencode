/**
 * Git Tools - streamlined version control operations
 *
 * Provides simplified git operations with auto-commit message generation.
 * Uses heuristic-based message generation to avoid nested LLM calls.
 */

import { spawnSync } from 'child_process';
import type { Tool } from '../types.js';

/**
 * Execute a git command safely using spawnSync (avoids shell injection)
 */
function runGit(args: string[], cwd?: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, {
    encoding: 'utf-8',
    cwd: cwd || process.cwd(),
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status ?? 1,
  };
}

/**
 * Generate a commit message based on the staged diff
 */
function generateCommitMessage(diffStat: string, fileChanges: string[]): string {
  // Parse stats from diff --stat output
  const statsLine = diffStat.split('\n').pop() || '';
  const insertions = statsLine.match(/(\d+) insertion/)?.[1] || '0';
  const deletions = statsLine.match(/(\d+) deletion/)?.[1] || '0';
  const filesChanged = fileChanges.length;

  // Detect file types for context
  const hasTests = fileChanges.some((f) => f.includes('test') || f.includes('spec'));
  const hasDocs = fileChanges.some((f) => f.endsWith('.md') || f.includes('doc'));
  const hasConfig = fileChanges.some(
    (f) => f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml')
  );
  const isNewFiles = parseInt(insertions) > 0 && parseInt(deletions) === 0;
  const isDeleteFiles = parseInt(deletions) > 0 && parseInt(insertions) === 0;
  const isRefactor = parseInt(insertions) > 0 && parseInt(deletions) > 0;

  // Generate message based on heuristics
  let prefix = '';
  if (hasTests) prefix = 'test: ';
  else if (hasDocs) prefix = 'docs: ';
  else if (hasConfig) prefix = 'chore: ';
  else if (isNewFiles) prefix = 'feat: ';
  else if (isDeleteFiles) prefix = 'chore: ';
  else if (isRefactor) prefix = 'refactor: ';
  else prefix = 'update: ';

  // Generate descriptive part
  if (filesChanged === 1) {
    const file = fileChanges[0].split('/').pop() || fileChanges[0];
    if (isNewFiles) return `${prefix}add ${file}`;
    if (isDeleteFiles) return `${prefix}remove ${file}`;
    return `${prefix}update ${file}`;
  }

  // Multiple files
  const commonDir = findCommonDirectory(fileChanges);
  if (commonDir) {
    return `${prefix}update ${commonDir} (${filesChanged} files)`;
  }

  return `${prefix}update ${filesChanged} files`;
}

/**
 * Find common directory prefix for files
 */
function findCommonDirectory(files: string[]): string | null {
  if (files.length === 0) return null;

  const parts = files.map((f) => f.split('/'));
  const minLength = Math.min(...parts.map((p) => p.length));

  const common: string[] = [];
  for (let i = 0; i < minLength - 1; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.length > 0 ? common.join('/') : null;
}

/**
 * Git commit tool - stage and commit changes
 */
export const gitCommitTool: Tool = {
  name: 'git_commit',
  description:
    'Stage and commit changes with optional auto-generated commit message. If no message provided, generates one based on the changes.',
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'string',
        description: 'Files to stage, space-separated (default: all modified files with ".")',
      },
      message: {
        type: 'string',
        description: 'Commit message (auto-generated if not provided)',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const files = (args.files as string) || '.';
    const message = args.message as string | undefined;

    // Check if in a git repo
    const checkRepo = runGit(['rev-parse', '--git-dir']);
    if (checkRepo.status !== 0) {
      return 'Error: Not in a git repository';
    }

    // Stage files
    const stageArgs = ['add', ...files.split(/\s+/).filter(Boolean)];
    const stageResult = runGit(stageArgs);
    if (stageResult.status !== 0) {
      return `Error staging files: ${stageResult.stderr || 'Unknown error'}`;
    }

    // Check if there are staged changes
    const staged = runGit(['diff', '--cached', '--name-only']);
    if (!staged.stdout) {
      return 'Nothing to commit (no staged changes)';
    }

    const stagedFiles = staged.stdout.split('\n').filter(Boolean);

    // Generate or use provided message
    let commitMsg = message;
    if (!commitMsg) {
      const diffStat = runGit(['diff', '--cached', '--stat']);
      commitMsg = generateCommitMessage(diffStat.stdout, stagedFiles);
    }

    // Commit
    const commitResult = runGit(['commit', '-m', commitMsg]);
    if (commitResult.status !== 0) {
      return `Error committing: ${commitResult.stderr || commitResult.stdout || 'Unknown error'}`;
    }

    // Get the commit hash
    const hashResult = runGit(['rev-parse', '--short', 'HEAD']);
    const commitHash = hashResult.stdout || 'unknown';

    return `Committed ${commitHash}: ${commitMsg}\n\nFiles:\n${stagedFiles.map((f) => `  ${f}`).join('\n')}`;
  },
};

/**
 * Git status tool - check working tree status
 */
export const gitStatusTool: Tool = {
  name: 'git_status',
  description: 'Show the working tree status (modified, staged, untracked files)',
  parameters: {
    type: 'object',
    properties: {
      short: {
        type: 'string',
        description: 'Use short format output (default: false)',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const short = args.short === 'true' || args.short === true;

    const result = runGit(['status', short ? '-s' : '--long']);
    if (result.status !== 0) {
      return `Error: ${result.stderr || 'Git status failed'}`;
    }

    return result.stdout || 'Working tree clean (nothing to commit)';
  },
};

/**
 * Git diff tool - show changes
 */
export const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show changes between commits, commit and working tree, etc.',
  parameters: {
    type: 'object',
    properties: {
      staged: {
        type: 'string',
        description: 'Show staged changes only (default: false)',
      },
      file: {
        type: 'string',
        description: 'Show diff for specific file',
      },
      stat: {
        type: 'string',
        description: 'Show diffstat instead of full diff (default: false)',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const staged = args.staged === 'true' || args.staged === true;
    const file = args.file as string | undefined;
    const stat = args.stat === 'true' || args.stat === true;

    const gitArgs = ['diff'];
    if (staged) gitArgs.push('--cached');
    if (stat) gitArgs.push('--stat');
    if (file) {
      gitArgs.push('--');
      gitArgs.push(file);
    }

    const result = runGit(gitArgs);
    if (result.status !== 0) {
      return `Error: ${result.stderr || 'Git diff failed'}`;
    }

    if (!result.stdout) {
      return staged ? 'No staged changes' : 'No changes';
    }
    return result.stdout;
  },
};
