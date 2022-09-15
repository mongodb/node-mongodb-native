import { MongoDriverError, MongoNetworkError } from '../error';
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
export class PoolClearedError extends MongoNetworkError {
  /** The address of the connection pool */
  address: string;

  constructor(pool: ConnectionPool) {
    // TODO(NODE-3135): pass in original pool-clearing error and use in message
    // "failed with: <original error which cleared the pool>"
    super(`Connection pool for ${pool.address} was cleared because another operation failed`);
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
