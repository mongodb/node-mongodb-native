import { EventEmitter } from 'events';
class Instrumentation extends EventEmitter {
  $MongoClient: any;
  $prototypeConnect: any;

  constructor() {
    super();
  }

  instrument(MongoClient: any, callback: Function) {
    // store a reference to the original functions
    this.$MongoClient = MongoClient;
    const $prototypeConnect = (this.$prototypeConnect = MongoClient.prototype.connect);

    const instrumentation = this;
    MongoClient.prototype.connect = function (callback: Function) {
      this.s.options.monitorCommands = true;
      this.on('commandStarted', (event: any) => instrumentation.emit('started', event));
      this.on('commandSucceeded', (event: any) => instrumentation.emit('succeeded', event));
      this.on('commandFailed', (event: any) => instrumentation.emit('failed', event));
      return $prototypeConnect.call(this, callback);
    };

    if (typeof callback === 'function') callback(null, this);
  }

  uninstrument() {
    this.$MongoClient.prototype.connect = this.$prototypeConnect;
  }
}

export = Instrumentation;
