'use strict';

const OperationBase = require('./operation').OperationBase;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;

class ExecuteDbAdminCommandOperation extends OperationBase {
  constructor(db, selector, options) {
    super(options);

    this.db = db;
    this.selector = selector;
  }

  execute(callback) {
    const db = this.db;
    const selector = this.selector;
    const options = this.options;

    db.s.topology.command('admin.$cmd', selector, options, (err, result) => {
      // Did the user destroy the topology
      if (db.serverConfig && db.serverConfig.isDestroyed()) {
        return callback(new MongoError('topology was destroyed'));
      }

      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.result);
    });
  }
}

module.exports = ExecuteDbAdminCommandOperation;
