'use strict';

const OperationBase = require('./operation').OperationBase;
const defineAspects = require('./common_functions').defineAspects;
const deleteCallback = require('./common_functions').deleteCallback;
const removeDocuments = require('./common_functions').removeDocuments;

class DeleteManyOperation extends OperationBase {
  constructor(collection, filter, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
  }

  static get aspects() {
    return this.aspects;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    options.single = false;
    removeDocuments(coll, filter, options, (err, r) => deleteCallback(err, r, callback));
  }
}

defineAspects(DeleteManyOperation, []);

module.exports = DeleteManyOperation;
