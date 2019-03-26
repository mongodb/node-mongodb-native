'use strict';

const OperationBase = require('./operation').OperationBase;
const updateCallback = require('./common_functions').updateCallback;
const updateDocuments = require('./common_functions').updateDocuments;

class UpdateManyOperation extends OperationBase {
  constructor(collection, filter, update, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = true;
    // Execute update
    updateDocuments(coll, filter, update, options, (err, r) => updateCallback(err, r, callback));
  }
}

module.exports = UpdateManyOperation;
