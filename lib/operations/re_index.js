'use strict';

const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;

class ReIndexOperation extends CommandOperation {
  constructor(collection, options) {
    super(collection.s.db, { reIndex: collection.collectionName }, options, collection);
  }

  execute(callback) {
    super.execute((err, result) => {
      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.ok ? true : false);
    });
  }
}

module.exports = ReIndexOperation;
