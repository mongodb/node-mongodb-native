'use strict';

const OperationBase = require('./operation').OperationBase;
const createIndexDb = require('./db_ops').createIndex;

class CreateIndexOperation extends OperationBase {
  constructor(collection, fieldOrSpec, options) {
    super(options);

    this.collection = collection;
    this.fieldOrSpec = fieldOrSpec;
  }

  execute(callback) {
    const coll = this.collection;
    const fieldOrSpec = this.fieldOrSpec;
    const options = this.options;

    createIndexDb(coll.s.db, coll.s.name, fieldOrSpec, options, callback);
  }
}

module.exports = CreateIndexOperation;
