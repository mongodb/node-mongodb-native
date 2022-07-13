import { MongoDriverError } from '../error';
import type { ConnectionPool } from './connection_pool';

/**
 * An error indicating a connection pool is closed
 * @category Error
 */
export class PoolClosedError extends MongoDriverError {
  /** The address of the connection pool */
  address: string;

  constructor(pool: ConnectionPool) {
    super('Attempted to check out a connection from closed connection pool');
    this.address = pool.address;
  }

  override get name(): string {
    return 'MongoPoolClosedError';
  }
}

/**
 * An error indicating a connection pool is currently paused
 * @category Error
 */
export class PoolClearedError extends MongoDriverError {
  // TODO: needs to extend RetryableError or be marked retryable in some other way per spec
  /** The address of the connection pool */
  address: string;

  constructor(pool: ConnectionPool) {
    // TODO: pass in original pool-clearing error and use in message
    super(
      `Connection pool for ${pool.address} was cleared because another operation failed with: <original error which cleared the pool>`
    );
    this.address = pool.address;
  }

  override get name(): string {
    return 'MongoPoolClearedError';
  }
}

/**
 * An error thrown when a request to check out a connection times out
 * @category Error
 */
export class WaitQueueTimeoutError extends MongoDriverError {
  /** The address of the connection pool */
  address: string;

  constructor(message: string, address: string) {
    super(message);
    this.address = address;
  }

  override get name(): string {
    return 'MongoWaitQueueTimeoutError';
  }
}
