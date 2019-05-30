'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;

class DropIndexOperation extends CommandOperation {
  constructor(collection, indexName, options) {
    super(collection.s.db, options, collection);

    this.collection = collection;
    this.indexName = indexName;
  }

  _buildCommand() {
    const collection = this.collection;
    const indexName = this.indexName;
    const options = this.options;

    let cmd = { dropIndexes: collection.collectionName, index: indexName };

    // Decorate command with writeConcern if supported
    cmd = applyWriteConcern(cmd, { db: collection.s.db, collection }, options);

    return cmd;
  }

  execute(callback) {
    // Execute command
    super.execute((err, result) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(DropIndexOperation, Aspect.WRITE_OPERATION);

module.exports = DropIndexOperation;
