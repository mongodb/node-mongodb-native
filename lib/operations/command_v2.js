'use strict';

const { OperationBase } = require('./operation');
const ReadConcern = require('../read_concern');
const WriteConcern = require('../write_concern');
const { maxWireVersion } = require('../utils');
const ReadPreference = require('../read_preference');
const { commandSupportsReadConcern } = require('../sessions');
const { MongoError } = require('../error');
const { isWriteCommand } = require('../sdam/topology');

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
    this.explain = false;

    this.fullResponse =
      operationOptions &&
      typeof operationOptions.fullResponse === 'boolean' &&
      operationOptions.fullResponse;

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

  /**
   *
   * @param {import('../sdam/server')['Server']} server
   * @param {*} cmd
   * @param {*} callback
   */
  executeCommand(server, cmd, callback) {
    // TODO: consider making this a non-enumerable property
    this.server = server;

    const options = this.options;
    const serverWireVersion = maxWireVersion(server);
    const inTransaction = this.inTransaction;

    if (this.readConcern && commandSupportsReadConcern(cmd) && !inTransaction) {
      Object.assign(cmd, { readConcern: this.readConcern });
    }

    if (this.writeConcern && isWriteCommand(cmd.command) && !inTransaction) {
      Object.assign(cmd, { writeConcern: this.writeConcern });
    }

    if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      callback(
        new MongoError(
          `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        )
      );
      return;
    } else {
      if (typeof options.collation === 'object') {
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
