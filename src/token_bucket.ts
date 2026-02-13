/**
 * @internal
 */
export class TokenBucket {
  private budget: number;
  private capacity: number;

  constructor(allowance: number) {
    this.budget = allowance;
    this.capacity = allowance;
  }

  deposit(tokens: number) {
    this.budget = Math.min(this.budget + tokens, this.capacity);
  }

  consume(tokens: number): boolean {
    if (tokens > this.budget) return false;

    this.budget -= tokens;
    return true;
  }
}

/**
 * @internal
 * The amount to deposit on successful operations, as defined in the backpressure specification.
 */
export const TOKEN_REFRESH_RATE = 0.1;
/**
 * @internal
 * The initial size of the token bucket, as defined in the backpressure specification.
 */
export const INITIAL_TOKEN_BUCKET_SIZE = 1000;
/**
 * @internal
 * The cost of a retry, as defined in the backpressure specification.
 */
export const RETRY_COST = 1;
