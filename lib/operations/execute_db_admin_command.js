'use strict';

const { OperationBase } = require('./operation');
const { handleCallback, MongoDBNamespace } = require('../utils');
const { MongoError } = require('../error');

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

    const namespace = new MongoDBNamespace('admin', '$cmd');
    db.s.topology.command(namespace, selector, options, (err, result) => {
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
