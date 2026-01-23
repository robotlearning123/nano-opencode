/**
 * Security tests for path traversal and ReDoS protection
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';

import { safePath } from '../src/utils/fs.js';
import { isUnsafeRegex, safeRegex, safeRegexTest } from '../src/utils/regex.js';
import { LRUCache } from '../src/utils/lru-cache.js';

describe('safePath security', () => {
  const rootPath = '/home/user/project';

  it('should allow valid relative paths within root', () => {
    const result = safePath('src/index.ts', rootPath);
    assert.ok(result);
    assert.ok(result.startsWith(rootPath));
  });

  it('should allow nested valid paths', () => {
    const result = safePath('src/components/Button.tsx', rootPath);
    assert.ok(result);
    assert.strictEqual(result, '/home/user/project/src/components/Button.tsx');
  });

  it('should reject path traversal with ../', () => {
    const result = safePath('../../../etc/passwd', rootPath);
    assert.strictEqual(result, null);
  });

  it('should reject path traversal in middle of path', () => {
    const result = safePath('src/../../../etc/passwd', rootPath);
    assert.strictEqual(result, null);
  });

  it('should reject absolute paths that escape root', () => {
    const result = safePath('/etc/passwd', rootPath);
    assert.strictEqual(result, null);
  });

  it('should allow paths that resolve to root itself', () => {
    const result = safePath('.', rootPath);
    assert.ok(result);
    assert.strictEqual(result, rootPath);
  });

  it('should handle paths with dots in filenames', () => {
    const result = safePath('src/.env.local', rootPath);
    assert.ok(result);
    assert.strictEqual(result, '/home/user/project/src/.env.local');
  });

  it('should handle percent-encoded strings (not decoded)', () => {
    // %2e%2e = .. but path.resolve doesn't URL-decode
    // So this creates a literal directory named "%2e%2e"
    const result = safePath('src/%2e%2e/file.txt', rootPath);
    // This is allowed because it doesn't actually escape the root
    // (the %2e chars are treated as literal characters)
    assert.ok(result);
    assert.ok(result.includes('%2e%2e'));
  });
});

describe('regex safety', () => {
  describe('isUnsafeRegex', () => {
    it('should detect nested quantifiers (a+)+', () => {
      assert.strictEqual(isUnsafeRegex('(a+)+'), true);
    });

    it('should detect nested quantifiers (a*)*', () => {
      assert.strictEqual(isUnsafeRegex('(a*)*'), true);
    });

    it('should detect nested quantifiers (a+)*', () => {
      assert.strictEqual(isUnsafeRegex('(a+)*'), true);
    });

    it('should detect nested quantifiers with repetition (a+){2,}', () => {
      assert.strictEqual(isUnsafeRegex('(a+){2,}'), true);
    });

    it('should allow safe patterns', () => {
      assert.strictEqual(isUnsafeRegex('^[a-z]+$'), false);
      assert.strictEqual(isUnsafeRegex('\\d{3}-\\d{4}'), false);
      assert.strictEqual(isUnsafeRegex('.*\\.ts$'), false);
    });

    it('should detect consecutive character classes with quantifiers', () => {
      // Conservative check: flags any consecutive [...]+ patterns
      // This may have false positives but prevents dangerous patterns
      assert.strictEqual(isUnsafeRegex('[a-z]+[a-z]+'), true);
      assert.strictEqual(isUnsafeRegex('[a-z]+[0-9]+'), true); // Conservative: flags this too
    });

    it('should allow single character class with quantifier', () => {
      assert.strictEqual(isUnsafeRegex('[a-z]+'), false);
      assert.strictEqual(isUnsafeRegex('[0-9]*'), false);
    });
  });

  describe('safeRegex', () => {
    it('should return null for unsafe patterns', () => {
      assert.strictEqual(safeRegex('(a+)+'), null);
    });

    it('should return RegExp for safe patterns', () => {
      const regex = safeRegex('^test.*$');
      assert.ok(regex instanceof RegExp);
    });

    it('should return null for invalid regex syntax', () => {
      const regex = safeRegex('[invalid');
      assert.strictEqual(regex, null);
    });
  });

  describe('safeRegexTest', () => {
    it('should return error for unsafe patterns', () => {
      const result = safeRegexTest('(a+)+', 'aaaa');
      assert.strictEqual(result.matched, false);
      assert.ok(result.error?.includes('unsafe'));
    });

    it('should match content with safe patterns', () => {
      const result = safeRegexTest('^hello', 'hello world');
      assert.strictEqual(result.matched, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should return error for invalid regex', () => {
      const result = safeRegexTest('[invalid', 'test');
      assert.strictEqual(result.matched, false);
      assert.ok(result.error?.includes('Invalid'));
    });
  });
});

describe('LRU cache', () => {
  it('should respect max size limit', () => {
    const cache = new LRUCache<string, number>(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.strictEqual(cache.size, 3);

    cache.set('d', 4); // Should evict 'a'
    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.has('a'), false);
    assert.strictEqual(cache.get('d'), 4);
  });

  it('should update access order on get', () => {
    const cache = new LRUCache<string, number>(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make it recently used
    cache.get('a');

    // Add new item - should evict 'b' (least recently used)
    cache.set('d', 4);
    assert.strictEqual(cache.has('a'), true);
    assert.strictEqual(cache.has('b'), false);
    assert.strictEqual(cache.has('c'), true);
    assert.strictEqual(cache.has('d'), true);
  });

  it('should handle get for non-existent key', () => {
    const cache = new LRUCache<string, number>(3);
    assert.strictEqual(cache.get('nonexistent'), undefined);
  });

  it('should update value when setting existing key', () => {
    const cache = new LRUCache<string, number>(3);

    cache.set('a', 1);
    cache.set('a', 2);

    assert.strictEqual(cache.get('a'), 2);
    assert.strictEqual(cache.size, 1);
  });

  it('should clear all entries', () => {
    const cache = new LRUCache<string, number>(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.has('a'), false);
  });

  it('should support async getOrCompute', async () => {
    const cache = new LRUCache<string, string>(3);
    let computeCount = 0;

    const getValue = () =>
      cache.getOrCompute('key', async () => {
        computeCount++;
        return 'computed';
      });

    const value1 = await getValue();
    const value2 = await getValue();

    assert.strictEqual(value1, 'computed');
    assert.strictEqual(value2, 'computed');
    assert.strictEqual(computeCount, 1); // Should only compute once
  });
});
