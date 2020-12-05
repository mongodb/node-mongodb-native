'use strict';

const OperationBase = require('./operation').OperationBase;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const ReadPreference = require('../core').ReadPreference;
const maxWireVersion = require('../core/utils').maxWireVersion;
const MongoError = require('../core/error').MongoError;

class FindOperation extends OperationBase {
  constructor(collection, ns, command, options) {
    super(options);

    this.ns = ns;
    this.cmd = command;
    this.readPreference = ReadPreference.resolve(collection, this.options);
  }

  execute(server, callback) {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;

    if (typeof this.cmd.allowDiskUse !== 'undefined' && maxWireVersion(server) < 4) {
      callback(new MongoError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    if (this.explain) {
      // We need to manually ensure explain is in the options.
      this.options.explain = this.explain.verbosity;
    }

    // TOOD: use `MongoDBNamespace` through and through
    const cursorState = this.cursorState || {};
    server.query(this.ns.toString(), this.cmd, cursorState, this.options, callback);
  }
}

defineAspects(FindOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION,
  Aspect.EXPLAINABLE
]);

module.exports = FindOperation;
