'use strict';

const OperationBase = require('./operation').OperationBase;
const resolveReadPreference = require('../utils').resolveReadPreference;

class CommandOperationV2 extends OperationBase {
  constructor(parent, options) {
    super(options);

    this.ns = parent.s.namespace.withCollection('$cmd');
    this.readPreference = resolveReadPreference(parent, this.options);
    this.readConcern = resolveReadConcern(parent, this.options);
    this.writeConcern = resolveWriteConcern(parent, this.options);
    this.explain = false;

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

    let fullResponse = this.options.full;
    if (this.explain) {
      cmd = { explain: cmd };
      fullResponse = false;
    }

    server.command(this.ns.toString(), cmd, this.options, (err, result) => {
      if (err) {
        callback(err, null);
        return;
      }

      if (fullResponse) {
        callback(null, result);
        return;
      }

      callback(null, result.result);
    });
  }
}

function resolveWriteConcern(parent, options) {
  return options.writeConcern || parent.writeConcern;
}

function resolveReadConcern(parent, options) {
  return options.readConcern || parent.readConcern;
}

module.exports = CommandOperationV2;
