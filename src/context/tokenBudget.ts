/**
 * Token budget management for context window
 */

import { getLogger } from '../telemetry/logger';

export class TokenBudget {
  private readonly budget: number;
  private used = 0;

  constructor(budget = 180000) {
    this.budget = budget;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  canFit(text: string): boolean {
    const tokens = this.estimateTokens(text);
    return this.used + tokens <= this.budget;
  }

  allocate(text: string): boolean {
    const tokens = this.estimateTokens(text);
    if (this.used + tokens > this.budget) {
      return false;
    }
    this.used += tokens;
    return true;
  }

  getRemaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  getUsed(): number {
    return this.used;
  }

  getBudget(): number {
    return this.budget;
  }

  getUtilization(): number {
    return this.budget > 0 ? (this.used / this.budget) * 100 : 0;
  }

  reset(): void {
    this.used = 0;
  }

  logStatus(): void {
    const logger = getLogger();
    logger.debug('Token budget status', {
      used: this.used,
      budget: this.budget,
      remaining: this.getRemaining(),
      utilization: `${this.getUtilization().toFixed(1)}%`,
    });
  }
}
