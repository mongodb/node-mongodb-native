'use strict';

const Operation = require('./operation').Operation;
const deleteCallback = require('./common_functions').deleteCallback;
const removeDocuments = require('./common_functions').removeDocuments;

class DeleteManyOperation extends Operation {
  constructor(collection, filter, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
  }

  static get aspects() {
    return new Set([]);
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    options.single = false;
    removeDocuments(coll, filter, options, (err, r) => deleteCallback(err, r, callback));
  }
}

module.exports = DeleteManyOperation;
