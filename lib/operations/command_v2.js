'use strict';

const { Aspect, OperationBase } = require('./operation');
const ReadConcern = require('../read_concern');
const WriteConcern = require('../write_concern');
const { maxWireVersion } = require('../utils');
const ReadPreference = require('../read_preference');
const { commandSupportsReadConcern } = require('../sessions');
const { MongoError } = require('../error');

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

class CommandOperationV2 extends OperationBase {
  constructor(parent, options, operationOptions) {
    super(options);

    this.ns = parent.s.namespace.withCollection('$cmd');
    this.readPreference = ReadPreference.resolve(parent, this.options);
    this.readConcern = resolveReadConcern(parent, this.options);
    this.writeConcern = resolveWriteConcern(parent, this.options);
    this.session = options && options.session;
    this.inTransaction = this.session && this.session.inTransaction();
    if (this.inTransaction) this.writeConcern = undefined;
    this.explain = false;

    if (operationOptions && typeof operationOptions.fullResponse === 'boolean') {
      this.fullResponse = operationOptions.fullResponse;
    }

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

    const options = this.options;
    const serverWireVersion = maxWireVersion(server);
    const inTransaction = this.session && this.session.inTransaction();

    if (this.readConcern && commandSupportsReadConcern(cmd) && !inTransaction) {
      Object.assign(cmd, { readConcern: this.readConcern });
    }

    if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      callback(
        new MongoError(
          `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        )
      );
      return;
    }

    if (serverWireVersion >= SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      if (this.writeConcern && this.hasAspect(Aspect.WRITE_OPERATION)) {
        Object.assign(cmd, { writeConcern: this.writeConcern });
      }

      if (options.collation && typeof options.collation === 'object') {
        Object.assign(cmd, { collation: options.collation });
      }
    }

    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    if (typeof options.comment === 'string') {
      cmd.comment = options.comment;
    }

    if (this.logger && this.logger.isDebug()) {
      this.logger.debug(`executing command ${JSON.stringify(cmd)} against ${this.ns}`);
    }

    server.command(this.ns.toString(), cmd, this.options, (err, result) => {
      if (err) {
        callback(err, null);
        return;
      }

      if (this.fullResponse) {
        callback(null, result);
        return;
      }

      callback(null, result.result);
    });
  }
}

function resolveWriteConcern(parent, options) {
  return (
    WriteConcern.fromOptions(options) ||
    (parent && parent.writeConcern) ||
    (parent && parent.s && parent.s.writeConcern)
  );
}

function resolveReadConcern(parent, options) {
  return ReadConcern.fromOptions(options) || parent.readConcern;
}

module.exports = CommandOperationV2;
