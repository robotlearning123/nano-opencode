/**
 * Simple LRU (Least Recently Used) cache with size limits
 *
 * Prevents unbounded memory growth when scanning large repositories.
 * Uses a Map internally, leveraging its insertion-order iteration.
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache
   * Moves the key to the end (most recently used)
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to end (most recent) by re-inserting
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache
   * Evicts the oldest entry if cache is full
   */
  set(key: K, value: V): void {
    // If key exists, delete first to update order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest (first) entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Get current size of cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or compute a value
   * If the key exists, return it. Otherwise compute, cache, and return.
   */
  async getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * Synchronous get or compute
   */
  getOrComputeSync(key: K, compute: () => V): V {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }
}

/**
 * Default cache sizes for different use cases
 */
export const CACHE_LIMITS = {
  FILE_CONTENT: 500, // Max 500 file contents cached
  GLOB_RESULTS: 100, // Max 100 glob patterns cached
} as const;
