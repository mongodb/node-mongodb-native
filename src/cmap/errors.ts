import { MongoDriverError, MongoErrorLabel, MongoNetworkError } from '../error';
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

  constructor(pool: ConnectionPool, message?: string) {
    const errorMessage = message
      ? message
      : `Connection pool for ${pool.address} was cleared because another operation failed with: "${pool.serverError?.message}"`;
    super(errorMessage);
    this.address = pool.address;

    this.addErrorLabel(MongoErrorLabel.RetryableWriteError);
  }

  override get name(): string {
    return 'MongoPoolClearedError';
  }
}

/**
 * An error indicating that a connection pool has been cleared after the monitor for that server timed out.
 * @category Error
 */
export class PoolClearedOnNetworkError extends PoolClearedError {
  constructor(pool: ConnectionPool) {
    super(pool, `Connection to ${pool.address} interrupted due to server monitor timeout`);
  }

  override get name(): string {
    return 'PoolClearedOnNetworkError';
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
