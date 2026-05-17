/**
 * Tests for TokenBudget
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TokenBudget } from "../tokenBudget";

describe("TokenBudget", () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget(1000);
  });

  describe("constructor", () => {
    it("should initialize with given budget", () => {
      expect(budget.getBudget()).toBe(1000);
      expect(budget.getUsed()).toBe(0);
      expect(budget.getRemaining()).toBe(1000);
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens for text", () => {
      const text = "Hello world";
      const tokens = budget.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it("should return 0 for empty string", () => {
      expect(budget.estimateTokens("")).toBe(0);
    });
  });

  describe("canFit", () => {
    it("should return true when content fits", () => {
      expect(budget.canFit("Small text")).toBe(true);
    });

    it("should return false when content exceeds budget", () => {
      const largeText = "x".repeat(10000);
      expect(budget.canFit(largeText)).toBe(false);
    });

    it("should return false when budget is exhausted", () => {
      budget.allocate("x".repeat(4000)); // Use all budget
      expect(budget.canFit("more")).toBe(false);
    });
  });

  describe("allocate", () => {
    it("should allocate tokens from budget", () => {
      const text = "Hello world";
      const initialRemaining = budget.getRemaining();

      budget.allocate(text);

      expect(budget.getUsed()).toBeGreaterThan(0);
      expect(budget.getRemaining()).toBeLessThan(initialRemaining);
    });

    it("should return false when allocating more than budget", () => {
      const largeText = "x".repeat(10000);
      const result = budget.allocate(largeText);
      expect(result).toBe(false);
    });
  });

  describe("getUtilization", () => {
    it("should return 0% when empty", () => {
      expect(budget.getUtilization()).toBe(0);
    });

    it("should return 100% when full", () => {
      budget.allocate("x".repeat(4000));
      expect(budget.getUtilization()).toBeGreaterThan(99);
    });

    it("should return correct percentage", () => {
      budget.allocate("x".repeat(2000)); // ~50% of 1000 tokens
      const utilization = budget.getUtilization();
      expect(utilization).toBeGreaterThan(40);
      expect(utilization).toBeLessThan(60);
    });
  });
});
