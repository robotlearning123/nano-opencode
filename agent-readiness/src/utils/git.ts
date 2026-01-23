/**
 * Git utilities for repository information
 */

import * as path from 'node:path';
import { fileExists, readFile, directoryExists } from './fs.js';
import { gitExec } from './exec.js';

/**
 * Check if path is inside a git repository (checks for .git in path or parents)
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  const gitRoot = await findGitRoot(repoPath);
  return gitRoot !== null;
}

/**
 * Find the git root directory for a given path
 * Walks up the directory tree looking for .git
 */
export async function findGitRoot(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const gitDir = path.join(currentPath, '.git');
    // .git can be a directory (normal) or a file (worktree/submodule)
    if ((await directoryExists(gitDir)) || (await fileExists(gitDir))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Check if the scanned path has its own .git (is the repo root)
 */
export async function isRepoRoot(repoPath: string): Promise<boolean> {
  const gitDir = path.join(repoPath, '.git');
  return (await directoryExists(gitDir)) || (await fileExists(gitDir));
}

/**
 * Get current commit SHA
 */
export function getCommitSha(repoPath: string): string {
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
 * For subdirectories of a git repo, returns "repo/subdir" format
 */
export function getRepoName(repoPath: string): string {
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

  if (!repoName) {
    return path.basename(repoPath);
  }

  // Check if we're in a subdirectory of the git repo
  const gitRootResult = gitExec(['rev-parse', '--show-toplevel'], repoPath);
  if (gitRootResult.success) {
    const gitRoot = gitRootResult.stdout;
    const resolvedPath = path.resolve(repoPath);
    if (resolvedPath !== gitRoot) {
      // We're in a subdirectory, append the relative path
      const relativePath = path.relative(gitRoot, resolvedPath);
      return `${repoName}/${relativePath}`;
    }
  }

  return repoName;
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoPath: string): string {
  const result = gitExec(['branch', '--show-current'], repoPath);
  return result.success && result.stdout ? result.stdout : 'unknown';
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(repoPath: string): boolean {
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
