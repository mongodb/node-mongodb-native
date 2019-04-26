'use strict';

const OperationBase = require('./operation').OperationBase;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;

class ReIndexOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const options = this.options;

    // Reindex
    const cmd = { reIndex: coll.collectionName };

    // Execute the command
    executeCommand(coll.s.db, cmd, options, (err, result) => {
      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.ok ? true : false);
    });
  }
}

module.exports = ReIndexOperation;
