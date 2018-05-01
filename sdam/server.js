'use strict';
const EventEmitter = require('events');

class Server extends EventEmitter {
  constructor(description) {
    super();

    this.s = {
      description
    };
  }

  get description() {
    return this.s.description;
  }

  /**
   * Initiate server connect
   *
   * @param {Array} [options.auth] Array of auth options to apply on connect
   */
  connect(options, callback) {
    options = options || {};

    if (typeof callback === 'function') {
      callback(null, null);
    }
  }

  /**
   * Destroy the server connection
   *
   * @param {Boolean} [options.emitClose=false] Emit close event on destroy
   * @param {Boolean} [options.emitDestroy=false] Emit destroy event on destroy
   * @param {Boolean} [options.force=false] Force destroy the pool
   */
  destroy(callback) {
    if (typeof callback === 'function') {
      callback(null, null);
    }
  }
}

module.exports = Server;
