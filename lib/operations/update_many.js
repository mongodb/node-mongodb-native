'use strict';

const OperationBase = require('./operation').OperationBase;
const updateCallback = require('./common_functions').updateCallback;
const updateDocuments = require('./common_functions').updateDocuments;
const hasAtomicOperators = require('../utils').hasAtomicOperators;

class UpdateManyOperation extends OperationBase {
  constructor(collection, filter, update, options) {
    super(options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

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
