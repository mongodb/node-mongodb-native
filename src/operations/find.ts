import { OperationBase, OperationOptions } from './operation';
import { Aspect, defineAspects } from './operation';
import { ReadPreference } from '../read_preference';
import { maxWireVersion } from '../utils';
import { MongoError } from '../error';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { InternalCursorState } from '../cursor/core_cursor';

export class FindOperation extends OperationBase {
  ns: string;
  cmd: Document;
  readPreference: ReadPreference;
  cursorState?: InternalCursorState;
  server?: Server;

  constructor(collection: Collection, ns: string, command: Document, options: OperationOptions) {
    super(options);

    this.ns = ns;
    this.cmd = command;
    this.readPreference = ReadPreference.resolve(collection, this.options);
  }

  execute(server: Server, callback: Callback): void {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;

    if (typeof this.cmd.allowDiskUse !== 'undefined' && maxWireVersion(server) < 4) {
      callback(new MongoError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    // TODO: use `MongoDBNamespace` through and through
    const cursorState = this.cursorState || {};
    server.query(this.ns.toString(), this.cmd, cursorState, this.options, callback);
  }
}

defineAspects(FindOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
