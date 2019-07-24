'use strict';

const CommandOperationV2 = require('./command_v2');
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const MongoDBNamespace = require('../utils').MongoDBNamespace;

class ListDatabasesOperation extends CommandOperationV2 {
  constructor(db, options) {
    super(db, options);
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  execute(server, callback) {
    const cmd = { listDatabases: 1 };
    if (this.options.nameOnly) {
      cmd.nameOnly = Number(cmd.nameOnly);
    }

    if (this.options.filter) {
      cmd.filter = this.options.filter;
    }

    if (typeof this.options.authorizedDatabases === 'boolean') {
      cmd.authorizedDatabases = this.options.authorizedDatabases;
    }

    super.executeCommand(server, cmd, callback);
  }
}

defineAspects(ListDatabasesOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = ListDatabasesOperation;
