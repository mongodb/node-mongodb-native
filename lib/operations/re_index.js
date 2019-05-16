'use strict';

const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;

class ReIndexOperation extends CommandOperation {
  constructor(collection, options) {
    super(collection.s.db, {}, options, collection);

    this.collection = collection;
  }

  execute(callback) {
    const collection = this.collection;

    const cmd = { reIndex: collection.collectionName };

    super.execute(cmd, (err, result) => {
      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.ok ? true : false);
    });
  }
}

module.exports = ReIndexOperation;
