'use strict';
const MongoError = require('../core/error').MongoError;

class PoolClosedError extends MongoError {
  constructor(pool) {
    super('Attempted to check out a connection from closed connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.type = 'PoolClosedError';
    this.address = pool.address;
  }
}

class WaitQueueTimeoutError extends MongoError {
  constructor(pool) {
    super('Timed out while checking out a connection from connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.type = 'WaitQueueTimeoutError';
    this.address = pool.address;
  }
}

module.exports = {
  PoolClosedError,
  WaitQueueTimeoutError
};
