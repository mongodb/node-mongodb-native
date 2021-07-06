import { MongoDriverError } from '../error';
import type { Connection } from './connection';
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

  get name(): string {
    return 'MongoPoolClosedError';
  }
}

/**
 * An error thrown when a request to check out a connection times out
 * @category Error
 */
export class WaitQueueTimeoutError extends MongoDriverError {
  /** The address of the connection pool */
  address: string;

  constructor(pool: Connection | ConnectionPool) {
    super('Timed out while checking out a connection from connection pool');
    this.address = pool.address;
  }

  get name(): string {
    return 'MongoWaitQueueTimeoutError';
  }
}
