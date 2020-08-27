import { EventEmitter } from 'events';
import type { Callback } from './utils';
import { Connection } from './cmap/connection';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MongoClient } from './mongo_client';

/** @public */
export class Instrumentation extends EventEmitter {
  $MongoClient?: typeof MongoClient;
  $prototypeConnect?: typeof MongoClient['connect'];

  /** @event */
  static readonly STARTED = 'started' as const;
  /** @event */
  static readonly SUCCEEDED = 'succeeded' as const;
  /** @event */
  static readonly FAILED = 'failed' as const;

  constructor() {
    super();
  }

  instrument(mongoClientClass: typeof MongoClient, callback?: Callback): void {
    // store a reference to the original functions
    this.$MongoClient = mongoClientClass;
    const $prototypeConnect = (this.$prototypeConnect = mongoClientClass.prototype.connect);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;
    mongoClientClass.prototype.connect = function (this: MongoClient, callback: Callback) {
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
    } as MongoClient['connect'];

    if (typeof callback === 'function') callback(undefined, this);
  }

  uninstrument(): void {
    if (this.$MongoClient) {
      this.$MongoClient.prototype.connect = this.$prototypeConnect as any;
    }
  }
}
