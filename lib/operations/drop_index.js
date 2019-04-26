'use strict';

const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;

class DropIndexOperation extends CommandOperation {
  constructor(collection, indexName, options) {
    let cmd = { dropIndexes: collection.collectionName, index: indexName };

    // Decorate command with writeConcern if supported
    cmd = applyWriteConcern(cmd, { db: collection.s.db, collection }, options);

    super(collection.s.db, cmd, options, collection);
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

module.exports = DropIndexOperation;
