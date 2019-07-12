'use strict';

const OperationBase = require('./operation').OperationBase;
const resolveReadPreference = require('../utils').resolveReadPreference;

class CommandOperationV2 extends OperationBase {
  constructor(parent, options) {
    super(options);

    this.ns = parent.s.namespace.withCollection('$cmd');
    this.readPreference = resolveReadPreference(parent, options);

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent.s.logger) {
      this.logger = parent.s.logger;
    } else if (parent.s.db && parent.s.db.logger) {
      this.logger = parent.s.db.logger;
    }
  }

  executeCommand(server, cmd, callback) {
    if (this.logger && this.logger.isDebug()) {
      this.logger.debug(`executing command ${JSON.stringify(cmd)} against ${this.ns}`);
    }

    server.command(this.ns.toString(), cmd, this.options, (err, result) => {
      if (err) {
        callback(err, null);
        return;
      }

      // full response was requested
      if (this.options.full) {
        callback(null, result);
        return;
      }

      callback(null, result.result);
    });
  }
}

module.exports = CommandOperationV2;
