'use strict';

const OperationBase = require('./operation').OperationBase;
const indexInformation = require('./common_functions').indexInformation;

class IndexesOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, { full: true }, options);
    indexInformation(coll.s.db, coll.collectionName, options, callback);
  }
}

module.exports = IndexesOperation;
