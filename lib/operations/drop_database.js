'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;

class DropDatabaseOperation extends OperationBase {
  constructor(db, command, options) {
    super(options);

    this.db = db;
    this.command = command;
  }

  execute(callback) {
    const db = this.db;
    const command = this.command;
    const options = this.options;

    const commandOperation = new CommandOperation(db, command, options);
    commandOperation.execute((err, result) => {
      // Did the user destroy the topology
      if (db.serverConfig && db.serverConfig.isDestroyed()) {
        return callback(new MongoError('topology was destroyed'));
      }

      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.ok ? true : false);
    });
  }
}

module.exports = DropDatabaseOperation;
