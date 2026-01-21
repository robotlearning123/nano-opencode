/**
 * NANO.md Memory System
 *
 * Hierarchical markdown-based persistent memory inspired by Claude Code's CLAUDE.md.
 *
 * Discovery order (highest priority first):
 * 1. ./subdir/NANO.md - Directory-scoped rules
 * 2. ./NANO.md - Project-specific context
 * 3. ~/.nano/NANO.md - Global user preferences
 *
 * All discovered files are merged, with more specific scopes taking precedence.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, relative, sep } from 'path';

export interface MemoryFile {
  path: string;
  content: string;
  scope: 'global' | 'project' | 'directory';
  relativePath?: string;
}

export interface MemoryContext {
  files: MemoryFile[];
  combined: string;
  lastLoaded: number;
}

// Cache for memory context
let memoryCache: MemoryContext | null = null;
let lastCwd: string | null = null;

// Memory file names (support both NANO.md and .nano.md for hidden preference)
const MEMORY_FILES = ['NANO.md', '.nano.md'];
const GLOBAL_DIR = join(homedir(), '.nano');
const GLOBAL_MEMORY = join(GLOBAL_DIR, 'NANO.md');

/**
 * Discover all NANO.md files in the hierarchy
 */
export function discoverMemoryFiles(cwd: string = process.cwd()): MemoryFile[] {
  const files: MemoryFile[] = [];

  // 1. Global memory (~/.nano/NANO.md)
  if (existsSync(GLOBAL_MEMORY)) {
    files.push({
      path: GLOBAL_MEMORY,
      content: readFileSync(GLOBAL_MEMORY, 'utf-8'),
      scope: 'global',
    });
  }

  // 2. Walk up from cwd to find project and directory-scoped memory files
  const discoveredPaths = new Set<string>();
  let currentDir = cwd;
  const root = sep === '/' ? '/' : currentDir.split(sep)[0] + sep;

  while (currentDir !== root && currentDir !== dirname(currentDir)) {
    for (const filename of MEMORY_FILES) {
      const memPath = join(currentDir, filename);
      if (existsSync(memPath) && !discoveredPaths.has(memPath)) {
        discoveredPaths.add(memPath);
        const isProjectRoot = currentDir === cwd;
        files.push({
          path: memPath,
          content: readFileSync(memPath, 'utf-8'),
          scope: isProjectRoot ? 'project' : 'directory',
          relativePath: relative(cwd, memPath) || '.',
        });
      }
    }
    currentDir = dirname(currentDir);
  }

  return files;
}

/**
 * Load memory context with caching
 */
export function loadMemoryContext(cwd: string = process.cwd(), forceReload = false): MemoryContext {
  // Check cache validity
  if (memoryCache && lastCwd === cwd && !forceReload) {
    // Refresh if older than 30 seconds
    if (Date.now() - memoryCache.lastLoaded < 30000) {
      return memoryCache;
    }
  }

  const files = discoverMemoryFiles(cwd);

  // Combine in reverse order (global first, most specific last)
  // This allows specific scopes to override general ones
  const sortedFiles = [...files].reverse();

  const sections: string[] = [];

  for (const file of sortedFiles) {
    const header = file.scope === 'global'
      ? '## Global Preferences (~/.nano/NANO.md)'
      : file.scope === 'project'
        ? '## Project Context (./NANO.md)'
        : `## Directory Context (${file.relativePath})`;

    sections.push(`${header}\n\n${file.content.trim()}`);
  }

  const combined = sections.length > 0
    ? `# Memory Context\n\n${sections.join('\n\n---\n\n')}`
    : '';

  memoryCache = {
    files,
    combined,
    lastLoaded: Date.now(),
  };
  lastCwd = cwd;

  return memoryCache;
}

/**
 * Get formatted memory context for system prompt injection
 */
export function getMemoryForPrompt(cwd: string = process.cwd()): string {
  const context = loadMemoryContext(cwd);

  if (!context.combined) {
    return '';
  }

  return `
<memory>
${context.combined}
</memory>

Use the above memory context to inform your responses. These are user-defined preferences,
project-specific rules, and accumulated insights from previous sessions.
`.trim();
}

/**
 * Save content to a memory file
 */
export function saveToMemory(
  content: string,
  scope: 'global' | 'project' = 'project',
  append = true
): { success: boolean; path: string; message: string } {
  const targetPath = scope === 'global'
    ? GLOBAL_MEMORY
    : join(process.cwd(), 'NANO.md');

  const targetDir = dirname(targetPath);

  try {
    // Ensure directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    let finalContent: string;

    if (append && existsSync(targetPath)) {
      const existing = readFileSync(targetPath, 'utf-8');
      // Add with separator
      finalContent = existing.trim() + '\n\n---\n\n' + content.trim() + '\n';
    } else {
      finalContent = content.trim() + '\n';
    }

    writeFileSync(targetPath, finalContent);

    // Invalidate cache
    memoryCache = null;

    return {
      success: true,
      path: targetPath,
      message: `Saved to ${scope === 'global' ? 'global' : 'project'} memory: ${targetPath}`,
    };
  } catch (error) {
    return {
      success: false,
      path: targetPath,
      message: `Failed to save memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Create a formatted memory entry for /remember command
 */
export function formatMemoryEntry(content: string, category?: string): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const header = category
    ? `### ${category} (${timestamp})`
    : `### Note (${timestamp})`;

  return `${header}\n\n${content}`;
}

/**
 * Clear memory cache (useful for testing or manual refresh)
 */
export function clearMemoryCache(): void {
  memoryCache = null;
  lastCwd = null;
}

/**
 * Get list of active memory files for display
 */
export function listMemoryFiles(cwd: string = process.cwd()): string[] {
  const context = loadMemoryContext(cwd);
  return context.files.map(f => `${f.scope}: ${f.path}`);
}

/**
 * Check if any memory files exist
 */
export function hasMemory(cwd: string = process.cwd()): boolean {
  const context = loadMemoryContext(cwd);
  return context.files.length > 0;
}
