'use strict';
const MongoError = require('../core/error').MongoError;

class PoolClosedError extends MongoError {
  constructor(pool) {
    super('Attempted to check out a connection from closed connection pool');
    this.name = 'MongoPoolClosedError';
    this.address = pool.address;
  }
}

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
