'use strict';

const OperationBase = require('./operation_base').OperationBase;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;
const debugFields = require('../operations/db_ops').debugFields;
const debugOptions = require('../utils').debugOptions;

class CommandOperation extends OperationBase {
  get readPreference() {
    return ReadPreference.primary;
  }

  executeCommand(ns, command, server, callback) {
    // TODO: this check is not necessary for the unified topology, remove when legacy
    //       topologies are removed.
    if (server.isDestroyed()) {
      callback(new MongoError('topology was destroyed'));
      return;
    }

    // Debug information
    if (server.s.logger.isDebug()) {
      server.s.logger.debug(
        `executing command ${JSON.stringify(
          command
        )} against \`${ns}.$cmd\` with options [${JSON.stringify(
          debugOptions(debugFields, this.options)
        )}]`
      );
    }

    // TODO: apply write concern, collation, read preference (if needed for sharded), etc.
    // TODO: `this.options` could (should?) be replaced with a new options object created
    //        here with _only_ options related to command exectuion
    server.command(`${ns.database}.$cmd`, command, this.options, (err, result) => {
      if (err) {
        callback(err, null);
        return;
      }

      callback(null, this.options && this.options.full ? result : result.result);
    });
  }
}

module.exports = { CommandOperation };
