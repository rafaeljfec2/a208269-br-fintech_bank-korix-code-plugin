/**
 * Tool Cache - LRU cache for tool results with intelligent invalidation
 *
 * Features:
 * - Segmented LRU cache (hot/cold partitioning)
 * - File watcher-based invalidation (no polling)
 * - TTL (time-to-live) expiration
 * - Size-based eviction
 * - Cache hit/miss metrics
 */

import * as crypto from "crypto";
import type { ToolResult } from "../../harness/toolRegistry";

export interface CacheEntry<T = unknown> {
  readonly key: string;
  readonly value: ToolResult<T>;
  readonly timestamp: number;
  readonly accessCount: number;
  readonly size: number; // bytes (estimated)
  readonly ttl?: number; // milliseconds
}

export interface CachePolicy {
  readonly maxSize: number; // bytes
  readonly maxAge: number; // milliseconds (default TTL)
  readonly maxEntries: number;
  readonly enableHotCold?: boolean; // hot/cold partitioning
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly evictions: number;
  readonly currentSize: number; // bytes
  readonly currentEntries: number;
  readonly hotEntries: number;
  readonly coldEntries: number;
}

interface CacheNode<T = unknown> {
  entry: CacheEntry<T>;
  prev: CacheNode<T> | null;
  next: CacheNode<T> | null;
  isHot: boolean;
}

/**
 * LRU Cache with doubly-linked list and hash map
 *
 * Algorithm:
 * 1. Hash map: key → CacheNode (O(1) lookup)
 * 2. Doubly linked list: LRU ordering (O(1) move-to-front)
 * 3. Hot/Cold partitioning: frequently accessed entries stay in hot partition
 * 4. Eviction: remove from tail (least recently used)
 */
export class ToolCache {
  private readonly cache: Map<string, CacheNode> = new Map();
  private head: CacheNode | null = null; // Most recently used
  private tail: CacheNode | null = null; // Least recently used
  private hotHead: CacheNode | null = null; // Hot partition head
  private currentSize = 0; // bytes
  private readonly policy: Required<CachePolicy>;

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(policy: CachePolicy) {
    this.policy = {
      maxSize: policy.maxSize,
      maxAge: policy.maxAge,
      maxEntries: policy.maxEntries,
      enableHotCold: policy.enableHotCold ?? true,
    };
  }

  /**
   * Get cached tool result
   *
   * @param tool Tool name
   * @param input Tool input
   * @returns Cached result or null
   */
  get<T>(tool: string, input: unknown): ToolResult<T> | null {
    const key = this.generateKey(tool, input);
    const node = this.cache.get(key);

    if (!node) {
      this.stats.misses++;
      return null;
    }

    // Check TTL expiration
    const age = Date.now() - node.entry.timestamp;
    const ttl = node.entry.ttl ?? this.policy.maxAge;

    if (age > ttl) {
      // Expired - remove
      this.remove(key);
      this.stats.misses++;
      return null;
    }

    // Cache hit - move to front (most recently used)
    this.moveToFront(node);

    // Increment access count
    node.entry = {
      ...node.entry,
      accessCount: node.entry.accessCount + 1,
    };

    // Promote to hot partition if accessed frequently
    if (
      this.policy.enableHotCold &&
      !node.isHot &&
      node.entry.accessCount >= 3
    ) {
      this.promoteToHot(node);
    }

    this.stats.hits++;
    return node.entry.value as ToolResult<T>;
  }

  /**
   * Set tool result in cache
   *
   * @param tool Tool name
   * @param input Tool input
   * @param result Tool result
   * @param ttl Optional TTL override (milliseconds)
   */
  set<T>(
    tool: string,
    input: unknown,
    result: ToolResult<T>,
    ttl?: number,
  ): void {
    const key = this.generateKey(tool, input);

    // Check if already cached
    const existing = this.cache.get(key);
    if (existing) {
      // Update existing entry
      this.currentSize -= existing.entry.size;
      existing.entry = {
        key,
        value: result,
        timestamp: Date.now(),
        accessCount: existing.entry.accessCount,
        size: this.estimateSize(result),
        ttl,
      };
      this.currentSize += existing.entry.size;
      this.moveToFront(existing);
      return;
    }

    // Create new entry
    const size = this.estimateSize(result);
    const entry: CacheEntry<T> = {
      key,
      value: result,
      timestamp: Date.now(),
      accessCount: 0,
      size,
      ttl,
    };

    const node: CacheNode<T> = {
      entry,
      prev: null,
      next: this.head,
      isHot: false,
    };

    // Add to hash map
    this.cache.set(key, node);

    // Add to front of linked list
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }

    this.currentSize += size;

    // Evict if over capacity
    this.evictIfNeeded();
  }

  /**
   * Invalidate cache entries matching pattern
   *
   * @param pattern String or regex pattern to match keys
   */
  invalidate(pattern: string | RegExp): void {
    const toRemove: string[] = [];

    for (const [key, _node] of this.cache.entries()) {
      const matches =
        typeof pattern === "string" ? key.includes(pattern) : pattern.test(key);

      if (matches) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.remove(key);
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hotHead = null;
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let hotEntries = 0;
    let coldEntries = 0;

    for (const node of this.cache.values()) {
      if (node.isHot) {
        hotEntries++;
      } else {
        coldEntries++;
      }
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions,
      currentSize: this.currentSize,
      currentEntries: this.cache.size,
      hotEntries,
      coldEntries,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Generate cache key from tool name and input
   */
  private generateKey(tool: string, input: unknown): string {
    const inputStr = JSON.stringify(input);
    const hash = crypto
      .createHash("sha256")
      .update(`${tool}:${inputStr}`)
      .digest("hex");

    return `${tool}:${hash.slice(0, 16)}`;
  }

  /**
   * Estimate size of tool result in bytes
   */
  private estimateSize(result: ToolResult): number {
    const str = JSON.stringify(result);
    return Buffer.byteLength(str, "utf-8");
  }

  /**
   * Move node to front of list (most recently used)
   */
  private moveToFront(node: CacheNode): void {
    if (node === this.head) {
      return; // Already at front
    }

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    }

    if (node === this.tail) {
      this.tail = node.prev;
    }

    // Add to front
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Promote node to hot partition
   */
  private promoteToHot(node: CacheNode): void {
    if (node.isHot) {
      return;
    }

    node.isHot = true;

    // Hot partition uses same linked list, but we track hot head
    if (!this.hotHead) {
      this.hotHead = node;
    }
  }

  /**
   * Remove entry from cache
   */
  private remove(key: string): void {
    const node = this.cache.get(key);
    if (!node) {
      return;
    }

    // Remove from linked list
    if (node.prev) {
      node.prev.next = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    }

    if (node === this.head) {
      this.head = node.next;
    }

    if (node === this.tail) {
      this.tail = node.prev;
    }

    if (node === this.hotHead) {
      // Find next hot node
      let current = node.next;
      while (current && !current.isHot) {
        current = current.next;
      }
      this.hotHead = current;
    }

    // Remove from map
    this.cache.delete(key);
    this.currentSize -= node.entry.size;
  }

  /**
   * Evict entries if cache exceeds capacity
   *
   * Eviction strategy:
   * 1. Remove expired entries first
   * 2. Remove from cold partition (LRU)
   * 3. If still over capacity, remove from hot partition
   */
  private evictIfNeeded(): void {
    // Remove expired entries first
    this.removeExpired();

    // Check if over capacity
    while (
      this.cache.size > this.policy.maxEntries ||
      this.currentSize > this.policy.maxSize
    ) {
      // Evict from tail (least recently used in cold partition)
      let nodeToEvict = this.tail;

      // If tail is hot, find last cold node
      if (nodeToEvict?.isHot && this.policy.enableHotCold) {
        let current = this.tail;
        while (current && current.isHot) {
          current = current.prev;
        }
        nodeToEvict = current;
      }

      // If no cold nodes, evict from hot partition
      if (!nodeToEvict) {
        nodeToEvict = this.tail;
      }

      if (!nodeToEvict) {
        break; // Cache is empty
      }

      this.remove(nodeToEvict.entry.key);
      this.stats.evictions++;
    }
  }

  /**
   * Remove all expired entries
   */
  private removeExpired(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [key, node] of this.cache.entries()) {
      const age = now - node.entry.timestamp;
      const ttl = node.entry.ttl ?? this.policy.maxAge;

      if (age > ttl) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.remove(key);
    }
  }
}
