'use strict';

const OperationBase = require('./operation').OperationBase;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const resolveReadPreference = require('../utils').resolveReadPreference;
const maxWireVersion = require('../core/utils').maxWireVersion;
const MongoError = require('../core/error').MongoError;

class FindOperation extends OperationBase {
  constructor(collection, ns, command, options) {
    super(options);

    this.ns = ns;
    this.cmd = command;
    this.readPreference = resolveReadPreference(collection, this.options);
  }

  execute(server, callback) {
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

module.exports = FindOperation;
