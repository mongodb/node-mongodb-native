'use strict';

const OperationBase = require('./operation').OperationBase;
const resolveReadPreference = require('../utils').resolveReadPreference;
const ReadConcern = require('../read_concern');
const WriteConcern = require('../write_concern');

class CommandOperationV2 extends OperationBase {
  constructor(parent, options) {
    super(options);

    this.ns = parent.s.namespace.withCollection('$cmd');
    this.readPreference = resolveReadPreference(parent, this.options);
    this.readConcern = resolveReadConcern(parent, this.options);
    this.writeConcern = resolveWriteConcern(parent, this.options);
    this.explain = false;

    // TODO: A lot of our code depends on having the read preference in the options. This should
    //       go away, but also requires massive test rewrites.
    this.options.readPreference = this.readPreference;

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent.s.logger) {
      this.logger = parent.s.logger;
    } else if (parent.s.db && parent.s.db.logger) {
      this.logger = parent.s.db.logger;
    }
  }

  executeCommand(server, cmd, callback) {
    // TODO: consider making this a non-enumerable property
    this.server = server;

    if (this.logger && this.logger.isDebug()) {
      this.logger.debug(`executing command ${JSON.stringify(cmd)} against ${this.ns}`);
    }

    let fullResponse = this.options.full;
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
  return WriteConcern.fromOptions(options) || parent.writeConcern;
}

function resolveReadConcern(parent, options) {
  return ReadConcern.fromOptions(options) || parent.readConcern;
}

module.exports = CommandOperationV2;
