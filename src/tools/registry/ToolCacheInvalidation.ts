/**
 * ToolCacheInvalidation - Cache invalidation by pattern
 *
 * Supports:
 * - String pattern matching (substring)
 * - Regex pattern matching
 * - Invalidate all
 */

/**
 * Invalidation manager for cache
 */
export class ToolCacheInvalidation {
  /**
   * Find keys matching pattern
   *
   * @param pattern String or regex pattern to match keys
   * @param cache Cache map
   * @returns Keys to invalidate
   */
  findMatching<T>(pattern: string | RegExp, cache: Map<string, T>): string[] {
    const matching: string[] = [];

    for (const key of cache.keys()) {
      if (this.matches(key, pattern)) {
        matching.push(key);
      }
    }

    return matching;
  }

  /**
   * Get all cache keys
   */
  findAll<T>(cache: Map<string, T>): string[] {
    return Array.from(cache.keys());
  }

  /**
   * Check if key matches pattern
   */
  private matches(key: string, pattern: string | RegExp): boolean {
    return typeof pattern === "string"
      ? key.includes(pattern)
      : pattern.test(key);
  }
}
