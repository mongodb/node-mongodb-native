import { MongoError } from '../error';

/**
 * An error indicating a connection pool is closed
 *
 * @property {string} address The address of the connection pool
 * @extends MongoError
 */
class PoolClosedError extends MongoError {
  address: any;
  constructor(pool: any) {
    super('Attempted to check out a connection from closed connection pool');
    this.name = 'MongoPoolClosedError';
    this.address = pool.address;
  }
}

/**
 * An error thrown when a request to check out a connection times out
 *
 * @property {string} address The address of the connection pool
 * @extends MongoError
 */
class WaitQueueTimeoutError extends MongoError {
  address: any;

  constructor(pool: any) {
    super('Timed out while checking out a connection from connection pool');
    this.name = 'MongoWaitQueueTimeoutError';
    this.address = pool.address;
  }
}

export { PoolClosedError, WaitQueueTimeoutError };
