'use strict';
const MongoError = require('../core/error').MongoError;

/**
 * An error indicating a connection pool is closed
 *
 * @property {string} address The address of the connection pool
 * @extends MongoError
 */
class PoolClosedError extends MongoError {
  constructor(pool) {
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
  constructor(pool) {
    super('Timed out while checking out a connection from connection pool');
    this.name = 'MongoWaitQueueTimeoutError';
    this.address = pool.address;
  }
}

module.exports = {
  PoolClosedError,
  WaitQueueTimeoutError
};
