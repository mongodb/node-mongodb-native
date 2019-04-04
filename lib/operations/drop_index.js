'use strict';

const OperationBase = require('./operation').OperationBase;
const applyWriteConcern = require('../utils').applyWriteConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;

class DropIndexOperation extends OperationBase {
  constructor(collection, indexName, options) {
    super(options);

    this.collection = collection;
    this.indexName = indexName;
  }

  execute(callback) {
    const coll = this.collection;
    const indexName = this.indexName;
    const options = this.options;

    // Delete index command
    const cmd = { dropIndexes: coll.s.name, index: indexName };

    // Decorate command with writeConcern if supported
    applyWriteConcern(cmd, { db: coll.s.db, collection: coll }, options);

    // Execute command
    executeCommand(coll.s.db, cmd, options, (err, result) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

module.exports = DropIndexOperation;
