'use strict';
const EventEmitter = require('events').EventEmitter;

class Instrumentation extends EventEmitter {
  constructor() {
    super();
  }

  instrument(MongoClient, callback) {
    // store a reference to the original functions
    this.$MongoClient = MongoClient;
    const $prototypeConnect = (this.$prototypeConnect = MongoClient.prototype.connect);

    const instrumentation = this;
    MongoClient.prototype.connect = function(callback) {
      this.s.options.monitorCommands = true;
      this.on('commandStarted', event => instrumentation.emit('started', event));
      this.on('commandSucceeded', event => instrumentation.emit('succeeded', event));
      this.on('commandFailed', event => instrumentation.emit('failed', event));
      return $prototypeConnect.call(this, callback);
    };

    if (typeof callback === 'function') callback(null, this);
  }

  uninstrument() {
    this.$MongoClient.prototype.connect = this.$prototypeConnect;
  }
}

module.exports = Instrumentation;
