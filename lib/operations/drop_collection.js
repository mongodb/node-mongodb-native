'use strict';

const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;

class DropCollectionOperation extends CommandOperation {
  constructor(db, command, options) {
    super(db, command, options);
  }

  execute(callback) {
    const db = this.db;

    super.execute((err, result) => {
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
