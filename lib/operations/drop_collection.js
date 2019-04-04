'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;

class DropCollectionOperation extends OperationBase {
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

      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

module.exports = DropCollectionOperation;
