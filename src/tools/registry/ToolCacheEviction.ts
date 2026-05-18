/**
 * ToolCacheEviction - Cache eviction strategies
 *
 * Handles:
 * - TTL (time-to-live) expiration
 * - LRU (least recently used) eviction
 * - Size-based eviction
 * - Hot/Cold partition aware eviction
 */

export interface CachePolicy {
  readonly maxSize: number;
  readonly maxAge: number;
  readonly maxEntries: number;
  readonly enableHotCold?: boolean;
}

export interface CacheEntry {
  readonly key: string;
  readonly timestamp: number;
  readonly size: number;
  readonly ttl?: number;
}

export interface CacheNode {
  readonly entry: CacheEntry;
  readonly prev: CacheNode | null;
  readonly next: CacheNode | null;
  readonly isHot: boolean;
}

/**
 * Eviction manager for cache
 */
export class ToolCacheEviction {
  constructor(private readonly policy: Required<CachePolicy>) {}

  /**
   * Evict entries if cache exceeds capacity
   *
   * Strategy:
   * 1. Remove expired entries first
   * 2. Remove from cold partition (LRU)
   * 3. If still over capacity, remove from hot partition
   *
   * @returns Keys to evict
   */
  evictIfNeeded(
    currentSize: number,
    cache: Map<string, CacheNode>,
    tail: CacheNode | null,
  ): string[] {
    const toEvict: string[] = [];

    // Remove expired entries first
    toEvict.push(...this.findExpired(cache));

    // Check if over capacity after removing expired
    const sizeAfterExpired = currentSize - this.calculateSize(toEvict, cache);

    if (
      cache.size - toEvict.length <= this.policy.maxEntries &&
      sizeAfterExpired <= this.policy.maxSize
    ) {
      return toEvict;
    }

    // Evict from tail (LRU) until under capacity
    let nodeToEvict = tail;
    let remainingSize = cache.size - toEvict.length;
    let remainingBytes = sizeAfterExpired;

    while (
      (remainingSize > this.policy.maxEntries ||
        remainingBytes > this.policy.maxSize) &&
      nodeToEvict
    ) {
      // Skip if already marked for eviction
      if (toEvict.includes(nodeToEvict.entry.key)) {
        nodeToEvict = nodeToEvict.prev;
        continue;
      }

      // Prefer cold nodes first
      if (nodeToEvict.isHot && this.policy.enableHotCold) {
        const coldNode = this.findLastColdNode(nodeToEvict, toEvict);
        if (coldNode) {
          toEvict.push(coldNode.entry.key);
          remainingSize--;
          remainingBytes -= coldNode.entry.size;
          nodeToEvict = coldNode.prev;
          continue;
        }
      }

      // Evict this node
      toEvict.push(nodeToEvict.entry.key);
      remainingSize--;
      remainingBytes -= nodeToEvict.entry.size;
      nodeToEvict = nodeToEvict.prev;
    }

    return toEvict;
  }

  /**
   * Find all expired entries
   */
  findExpired(cache: Map<string, CacheNode>): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, node] of cache.entries()) {
      const age = now - node.entry.timestamp;
      const ttl = node.entry.ttl ?? this.policy.maxAge;

      if (age > ttl) {
        expired.push(key);
      }
    }

    return expired;
  }

  /**
   * Check if entry is expired
   */
  isExpired(node: CacheNode): boolean {
    const age = Date.now() - node.entry.timestamp;
    const ttl = node.entry.ttl ?? this.policy.maxAge;
    return age > ttl;
  }

  /**
   * Find last cold node in the list (traversing backwards)
   */
  private findLastColdNode(
    start: CacheNode,
    excludeKeys: string[],
  ): CacheNode | null {
    let current: CacheNode | null = start;

    while (current) {
      if (!current.isHot && !excludeKeys.includes(current.entry.key)) {
        return current;
      }
      current = current.prev;
    }

    return null;
  }

  /**
   * Calculate total size of entries to evict
   */
  private calculateSize(keys: string[], cache: Map<string, CacheNode>): number {
    let total = 0;

    for (const key of keys) {
      const node = cache.get(key);
      if (node) {
        total += node.entry.size;
      }
    }

    return total;
  }
}
