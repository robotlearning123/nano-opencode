/**
 * Git utilities for repository information
 *
 * IMPORTANT: Each scanned directory is treated as a STANDALONE repository.
 * Git info is ONLY used if .git exists directly in the scanned path.
 * Parent directories are NOT checked - this prevents subdirectories from
 * inheriting git info from parent repos.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileExists, readFile, directoryExists } from './fs.js';
import { gitExec } from './exec.js';

/**
 * Check if path has its own .git directory (is a standalone git repository)
 * Does NOT check parent directories
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  const gitDir = path.join(repoPath, '.git');
  return (await directoryExists(gitDir)) || (await fileExists(gitDir));
}

/**
 * Check if .git exists synchronously (for use in sync functions)
 */
function hasGitDir(repoPath: string): boolean {
  const gitDir = path.join(repoPath, '.git');
  try {
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Get current commit SHA
 * Returns 'unknown' if no .git exists in the scanned path
 */
export function getCommitSha(repoPath: string): string {
  if (!hasGitDir(repoPath)) {
    return 'unknown';
  }
  const result = gitExec(['rev-parse', 'HEAD'], repoPath);
  return result.success ? result.stdout : 'unknown';
}

/**
 * Get short commit SHA (7 chars)
 */
export function getShortCommitSha(repoPath: string): string {
  const sha = getCommitSha(repoPath);
  return sha === 'unknown' ? sha : sha.substring(0, 7);
}

/**
 * Get repository name from git remote or folder name
 * Only uses git info if .git exists in the scanned path
 */
export function getRepoName(repoPath: string): string {
  // Only use git if .git exists in this directory
  if (!hasGitDir(repoPath)) {
    return path.basename(repoPath);
  }

  const result = gitExec(['remote', 'get-url', 'origin'], repoPath);

  if (!result.success) {
    return path.basename(repoPath);
  }

  const url = result.stdout;
  let repoName: string | null = null;

  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    repoName = sshMatch[1];
  }

  // Handle HTTPS format: https://github.com/owner/repo.git
  if (!repoName) {
    const httpsMatch = url.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      repoName = httpsMatch[1];
    }
  }

  return repoName || path.basename(repoPath);
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoPath: string): string {
  if (!hasGitDir(repoPath)) {
    return 'unknown';
  }
  const result = gitExec(['branch', '--show-current'], repoPath);
  return result.success && result.stdout ? result.stdout : 'unknown';
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(repoPath: string): boolean {
  if (!hasGitDir(repoPath)) {
    return false;
  }
  const result = gitExec(['status', '--porcelain'], repoPath);
  return result.success && result.stdout.length > 0;
}

/**
 * Parse .gitignore patterns
 */
export async function getGitIgnorePatterns(repoPath: string): Promise<string[]> {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const content = await readFile(gitignorePath);

  if (!content) return [];

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}
