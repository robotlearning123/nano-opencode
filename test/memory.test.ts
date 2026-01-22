import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  discoverMemoryFiles,
  loadMemoryContext,
  formatMemoryEntry,
  clearMemoryCache,
  hasMemory,
  listMemoryFiles,
} from '../src/memory/index.js';

describe('Memory System', () => {
  const testDir = join(tmpdir(), `nano-memory-test-${Date.now()}`);
  const subDir = join(testDir, 'subdir');

  before(() => {
    // Create test directory structure
    mkdirSync(testDir, { recursive: true });
    mkdirSync(subDir, { recursive: true });
    clearMemoryCache();
  });

  after(() => {
    // Cleanup
    rmSync(testDir, { recursive: true, force: true });
    clearMemoryCache();
  });

  describe('discoverMemoryFiles', () => {
    it('returns empty array when no memory files exist', () => {
      const files = discoverMemoryFiles(testDir);
      // May find global ~/.nano/NANO.md, filter to test-specific
      const testFiles = files.filter((f) => f.path.startsWith(testDir));
      assert.strictEqual(testFiles.length, 0);
    });

    it('discovers project NANO.md', () => {
      const projectMd = join(testDir, 'NANO.md');
      writeFileSync(projectMd, '# Project Memory\nTest content');

      clearMemoryCache();
      const files = discoverMemoryFiles(testDir);
      const projectFile = files.find((f) => f.path === projectMd);

      assert.ok(projectFile);
      assert.strictEqual(projectFile.scope, 'project');
      assert.ok(projectFile.content.includes('Test content'));
    });

    it('discovers directory-scoped NANO.md from parent', () => {
      const subMd = join(subDir, 'NANO.md');
      writeFileSync(subMd, '# Subdir Memory\nSubdir content');

      clearMemoryCache();
      const files = discoverMemoryFiles(subDir);
      const subFile = files.find((f) => f.path === subMd);

      assert.ok(subFile);
      assert.strictEqual(subFile.scope, 'project'); // project relative to cwd
    });
  });

  describe('loadMemoryContext', () => {
    it('caches memory context', () => {
      clearMemoryCache();
      const first = loadMemoryContext(testDir);
      const second = loadMemoryContext(testDir);

      // Same reference means cached
      assert.strictEqual(first.lastLoaded, second.lastLoaded);
    });

    it('combines memory files into context', () => {
      clearMemoryCache();
      const context = loadMemoryContext(testDir);

      assert.ok(context.combined.length > 0);
      assert.ok(context.files.length > 0);
    });
  });

  describe('formatMemoryEntry', () => {
    it('formats entry with timestamp', () => {
      const entry = formatMemoryEntry('Test insight');
      assert.ok(entry.includes('### Note'));
      assert.ok(entry.includes('Test insight'));
      // Check date format YYYY-MM-DD
      assert.ok(/\d{4}-\d{2}-\d{2}/.test(entry));
    });

    it('formats entry with category', () => {
      const entry = formatMemoryEntry('Test insight', 'Architecture');
      assert.ok(entry.includes('### Architecture'));
    });
  });

  describe('hasMemory', () => {
    it('returns true when memory files exist', () => {
      clearMemoryCache();
      const result = hasMemory(testDir);
      assert.strictEqual(result, true);
    });
  });

  describe('listMemoryFiles', () => {
    it('returns formatted list of files', () => {
      clearMemoryCache();
      const files = listMemoryFiles(testDir);
      assert.ok(Array.isArray(files));
      assert.ok(files.length > 0);
      // Each entry should have scope prefix
      assert.ok(files.some((f) => f.includes(':')));
    });
  });
});
