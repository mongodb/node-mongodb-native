'use strict';

class Connection {
  constructor(options) {
    options = options || {};
    this.generation = options.generation;
    this.id = options.id;
    this.maxIdleTimeMS = options.maxIdleTimeMS;
    this.poolId = options.poolId;
    this.address = options.address;
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
    this.callbacks = [];
  }

  get metadata() {
    return {
      id: this.id,
      generation: this.generation,
      poolId: this.poolId,
      address: this.adress
    };
  }

  timeIdle() {
    return this.readyToUse ? Date.now() - this.lastMadeAvailable : 0;
  }

  write(callback) {
    setTimeout(() => callback());
  }

  makeReadyToUse() {
    this.readyToUse = true;
    this.lastMadeAvailable = Date.now();
  }

  makeInUse() {
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
  }

  waitUntilConnect(callback) {
    if (this.readyToUse) {
      return callback(null, this);
    }

    this.callbacks.push(callback);
  }

  connect(callback) {
    this.callbacks.push(callback);
    setTimeout(() => {
      this.makeReadyToUse();
      this.callbacks.forEach(c => c(null, this));
      this.callbacks = [];
    });
  }

  destroy() {}
}

module.exports.Connection = Connection;
