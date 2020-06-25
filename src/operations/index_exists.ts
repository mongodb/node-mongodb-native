'use strict';

const OperationBase = require('./operation').OperationBase;
const handleCallback = require('../utils').handleCallback;
const indexInformationDb = require('./db_ops').indexInformation;

class IndexExistsOperation extends OperationBase {
  constructor(collection, indexes, options) {
    super(options);

    this.collection = collection;
    this.indexes = indexes;
  }

  execute(callback) {
    const coll = this.collection;
    const indexes = this.indexes;
    const options = this.options;

    indexInformationDb(coll.s.db, coll.collectionName, options, (err, indexInformation) => {
      // If we have an error return
      if (err != null) return handleCallback(callback, err, null);
      // Let's check for the index names
      if (!Array.isArray(indexes))
        return handleCallback(callback, null, indexInformation[indexes] != null);
      // Check in list of indexes
      for (let i = 0; i < indexes.length; i++) {
        if (indexInformation[indexes[i]] == null) {
          return handleCallback(callback, null, false);
        }
      }

      // All keys found return true
      return handleCallback(callback, null, true);
    });
  }
}

module.exports = IndexExistsOperation;
