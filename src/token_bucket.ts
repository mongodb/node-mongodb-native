/**
 * @internal
 */
export class TokenBucket {
  private budget: number;
  constructor(allowance: number) {
    this.budget = allowance;
  }
  deposit(tokens: number) {
    this.budget += tokens;
  }

  consume(tokens: number): boolean {
    if (tokens > this.budget) return false;

    this.budget -= tokens;
    return true;
  }
}

export const TOKEN_REFRESH_RATE = 0.1;
export const INITIAL_SIZE = 1000;
export const RETRY_COST = 1;
