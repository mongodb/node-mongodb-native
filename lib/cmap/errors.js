'use strict';

class PoolClosedError extends Error {
  constructor(pool) {
    super('Attempted to check out a connection from closed connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.type = 'PoolClosedError';
    this.address = pool.address;
  }
}

class WaitQueueTimeoutError extends Error {
  constructor(pool) {
    super('Timed out while checking out a connection from connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.type = 'WaitQueueTimeoutError';
    this.address = pool.address;
  }
}

// Technically not part of the spec.
class PoolReleaseForeignConnectionError extends Error {
  constructor(pool) {
    super('Attempted to check in a connection created by a different pool');
    Error.captureStackTrace(this, this.constructor);
    this.errorType = 'poolReleaseForeignConnectionError';
    this.address = pool.address;
  }
}

module.exports = {
  PoolClosedError,
  WaitQueueTimeoutError,
  PoolReleaseForeignConnectionError
};
