'use strict';

const OperationBase = require('./operation').OperationBase;
const DropIndexOperation = require('./drop_index');
const handleCallback = require('../utils').handleCallback;

class DropIndexesOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const options = this.options;

    const dropIndexOperation = new DropIndexOperation(coll, '*', options);

    dropIndexOperation.execute(err => {
      if (err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }
}

module.exports = DropIndexesOperation;
