'use strict';
import { OperationBase } from './operation';
import { Aspect, defineAspects } from './operation';
import ReadPreference = require('../read_preference');
import { maxWireVersion } from '../utils';
import { MongoError } from '../error';

class FindOperation extends OperationBase {
  ns: any;
  cmd: any;
  readPreference: any;
  cursorState: any;
  server: any;

  constructor(collection: any, ns: any, command: any, options: any) {
    super(options);

    this.ns = ns;
    this.cmd = command;
    this.readPreference = ReadPreference.resolve(collection, this.options);
  }

  execute(server: any, callback: Function) {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;

    if (typeof this.cmd.allowDiskUse !== 'undefined' && maxWireVersion(server) < 4) {
      callback(new MongoError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    // TOOD: use `MongoDBNamespace` through and through
    const cursorState = this.cursorState || {};
    server.query(this.ns.toString(), this.cmd, cursorState, this.options, callback);
  }
}

defineAspects(FindOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = FindOperation;
