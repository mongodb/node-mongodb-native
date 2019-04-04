'use strict';

const OperationBase = require('./operation').OperationBase;
const indexInformationDb = require('./common_functions').indexInformation;

class IndexesOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, { full: true }, options);
    indexInformationDb(coll.s.db, coll.s.name, options, callback);
  }
}

module.exports = IndexesOperation;
