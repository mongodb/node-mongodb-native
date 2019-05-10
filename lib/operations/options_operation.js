'use strict';

const OperationBase = require('./operation').OperationBase;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;

class OptionsOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const opts = this.options;

    coll.s.db.listCollections({ name: coll.collectionName }, opts).toArray((err, collections) => {
      if (err) return handleCallback(callback, err);
      if (collections.length === 0) {
        return handleCallback(
          callback,
          MongoError.create({ message: `collection ${coll.namespace} not found`, driver: true })
        );
      }

      handleCallback(callback, err, collections[0].options || null);
    });
  }
}

module.exports = OptionsOperation;
