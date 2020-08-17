import { EventEmitter } from 'events';
import type { Callback } from './utils';
import { Connection } from './cmap/connection';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MongoClient } from './mongo_client';

export class Instrumentation extends EventEmitter {
  $MongoClient: any;
  $prototypeConnect: any;

  /** @event */
  static readonly STARTED = 'started' as const;
  /** @event */
  static readonly SUCCEEDED = 'succeeded' as const;
  /** @event */
  static readonly FAILED = 'failed' as const;

  constructor() {
    super();
  }

  instrument(MongoClient: any, callback: Callback) {
    // store a reference to the original functions
    this.$MongoClient = MongoClient;
    const $prototypeConnect = (this.$prototypeConnect = MongoClient.prototype.connect);

    const instrumentation = this;
    MongoClient.prototype.connect = function (this: MongoClient, callback: Callback) {
      // override monitorCommands to be switched on
      this.s.options = { ...(this.s.options ?? {}), monitorCommands: true };

      this.on(Connection.COMMAND_STARTED, event =>
        instrumentation.emit(Instrumentation.STARTED, event)
      );
      this.on(Connection.COMMAND_SUCCEEDED, event =>
        instrumentation.emit(Instrumentation.SUCCEEDED, event)
      );
      this.on(Connection.COMMAND_FAILED, event =>
        instrumentation.emit(Instrumentation.FAILED, event)
      );

      return $prototypeConnect.call(this, callback);
    };

    if (typeof callback === 'function') callback(undefined, this);
  }

  uninstrument() {
    this.$MongoClient.prototype.connect = this.$prototypeConnect;
  }
}
