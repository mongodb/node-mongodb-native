'use strict';

const OperationBase = require('./operation').OperationBase;
const defineAspects = require('./common_functions').defineAspects;
const updateCallback = require('./common_functions').updateCallback;
const updateDocuments = require('./common_functions').updateDocuments;

class UpdateManyOperation extends OperationBase {
  constructor(collection, filter, update, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  static get aspects() {
    return this.aspects;
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

defineAspects(UpdateManyOperation, []);

module.exports = UpdateManyOperation;
