'use strict';

const OperationBase = require('./operation').OperationBase;
const indexInformationDb = require('./db_ops').indexInformation;

class IndexInformationOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const options = this.options;

    indexInformationDb(coll.s.db, coll.s.name, options, callback);
  }
}

module.exports = IndexInformationOperation;
