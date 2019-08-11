'use strict';

const OperationBase = require('./operation').OperationBase;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;

class FindOperation extends OperationBase {
  constructor(collection, ns, command, options) {
    super(options);

    this.ns = ns;
    this.cmd = command;
  }

  execute(server, callback) {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;

    const cursorState = this.cursorState || {};

    // TOOD: use `MongoDBNamespace` through and through
    server.query(this.ns.toString(), this.cmd, cursorState, this.options, callback);
  }
}

defineAspects(FindOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION,
  Aspect.SKIP_SESSION
]);

module.exports = FindOperation;
