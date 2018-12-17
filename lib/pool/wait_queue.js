'use strict';

const errors = require('./errors');
const PoolClosedError = errors.PoolClosedError;
const WaitQueueTimeoutError = errors.WaitQueueTimeoutError;

class WaitQueueMember {
  constructor(callback) {
    this.callback = callback;
    this.finished = false;
    this.timeout = null;
  }

  _finish(err, ret) {
    if (!this.finished) {
      this.finished = true;
      process.nextTick(() => this.callback.call(null, err, ret));
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }

  success(connection) {
    this._finish(null, connection);
  }

  failure(err) {
    this._finish(err);
  }

  setTimeout(cb, ms) {
    this.timeout = setTimeout(cb, ms);
  }
}

class WaitQueue {
  constructor(options) {
    this._destroyed = false;

    this.timeoutMS =
      typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 0;
    this.periodMS = options.waitQueuePeriodMS || 10;

    this._pool = options.pool;
    this._queue = [];
    this._timeout = null;
  }

  // Returns true if managed to enter wait queue
  enter(callback) {
    const item = new WaitQueueMember(callback);
    this._queue.push(item);
    if (this.timeoutMS > 0) {
      item.setTimeout(() => this._timeoutHandler(item), this.timeoutMS);
    }

    this._start();

    return true;
  }

  destroy() {
    this._destroyed = true;
    this._stop();
    this._clear();
    this._queue = undefined;
    this._pool = undefined;
  }

  _timeoutHandler(item) {
    if (!item.finished) {
      this._queue.splice(this._queue.indexOf(item), 1);
      item.failure(new WaitQueueTimeoutError(this._pool));
    }
  }

  _clear() {
    while (this._queue && this._queue.length) {
      const item = this._queue.shift();
      item.failure(new PoolClosedError(this._pool));
    }
  }

  _start() {
    if (!this._timeout) {
      this._timeout = setTimeout(() => this._run());
    }
  }

  _stop() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }

  _run() {
    // If we're closed, destroy entire wait queue
    if (this._destroyed) {
      this._clear();
    }

    if (!(this._queue && this._queue.length)) {
      return this._stop();
    }

    const item = this._queue.shift();
    if (item.finished) {
      return setTimeout(() => this._run());
    }

    this._pool._tryToGetConnection((err, connection) => {
      setTimeout(() => this._run());
      if (connection) {
        connection.waitUntilConnect(err => {
          if (err) {
            return item.failure(connection);
          }
          item.success(connection);
        });
      } else {
        this._queue.unshift(item);
      }
    });
  }
}

module.exports = { WaitQueue };
