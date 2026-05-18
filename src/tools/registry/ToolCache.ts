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
import { ToolCacheMetrics, type CacheStats } from "./ToolCacheMetrics";
import { ToolCacheEviction, type CachePolicy } from "./ToolCacheEviction";
import { ToolCacheInvalidation } from "./ToolCacheInvalidation";

export type { CacheStats, CachePolicy };

export interface CacheEntry<T = unknown> {
  readonly key: string;
  readonly value: ToolResult<T>;
  readonly timestamp: number;
  readonly accessCount: number;
  readonly size: number; // bytes (estimated)
  readonly ttl?: number; // milliseconds
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
  private readonly cache: Map<string, CacheNode<unknown>> = new Map();
  private head: CacheNode<unknown> | null = null; // Most recently used
  private tail: CacheNode<unknown> | null = null; // Least recently used
  private hotHead: CacheNode<unknown> | null = null; // Hot partition head
  private currentSize = 0; // bytes
  private readonly policy: Required<CachePolicy>;

  private readonly metrics: ToolCacheMetrics;
  private readonly eviction: ToolCacheEviction;
  private readonly invalidation: ToolCacheInvalidation;

  constructor(policy: CachePolicy) {
    this.policy = {
      maxSize: policy.maxSize,
      maxAge: policy.maxAge,
      maxEntries: policy.maxEntries,
      enableHotCold: policy.enableHotCold ?? true,
    };

    this.metrics = new ToolCacheMetrics();
    this.eviction = new ToolCacheEviction(this.policy);
    this.invalidation = new ToolCacheInvalidation();
  }

  /**
   * Get cached tool result
   */
  get<T>(tool: string, input: unknown): ToolResult<T> | null {
    const key = this.generateKey(tool, input);
    const node = this.cache.get(key);

    if (!node) {
      this.metrics.recordMiss();
      return null;
    }

    // Check TTL expiration
    if (this.eviction.isExpired(node)) {
      this.remove(key);
      this.metrics.recordMiss();
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

    this.metrics.recordHit();
    return node.entry.value as ToolResult<T>;
  }

  /**
   * Set tool result in cache
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
      next: this.head as CacheNode<T> | null,
      isHot: false,
    };

    // Add to hash map
    this.cache.set(key, node);

    // Add to front of linked list
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    this.tail ??= node;

    this.currentSize += size;

    // Evict if over capacity
    this.performEviction();
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidate(pattern: string | RegExp): void {
    const toRemove = this.invalidation.findMatching(pattern, this.cache);

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
    return this.metrics.getStats(this.currentSize, this.cache);
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.metrics.reset();
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

    this.tail ??= node;
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
    this.hotHead ??= node;
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
   * Perform eviction using eviction manager
   */
  private performEviction(): void {
    const toEvict = this.eviction.evictIfNeeded(
      this.currentSize,
      this.cache,
      this.tail,
    );

    for (const key of toEvict) {
      this.remove(key);
      this.metrics.recordEviction();
    }
  }
}
