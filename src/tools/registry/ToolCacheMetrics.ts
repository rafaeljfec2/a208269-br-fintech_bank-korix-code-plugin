/**
 * ToolCacheMetrics - Cache statistics tracking
 *
 * Tracks hits, misses, evictions, and calculates hit rate.
 */

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly evictions: number;
  readonly currentSize: number;
  readonly currentEntries: number;
  readonly hotEntries: number;
  readonly coldEntries: number;
}

interface CacheNode {
  readonly isHot: boolean;
}

/**
 * Metrics tracker for cache operations
 */
export class ToolCacheMetrics {
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordEviction(): void {
    this.evictions++;
  }

  getStats(currentSize: number, cache: Map<string, CacheNode>): CacheStats {
    let hotEntries = 0;
    let coldEntries = 0;

    for (const node of cache.values()) {
      if (node.isHot) {
        hotEntries++;
      } else {
        coldEntries++;
      }
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      evictions: this.evictions,
      currentSize,
      currentEntries: cache.size,
      hotEntries,
      coldEntries,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
