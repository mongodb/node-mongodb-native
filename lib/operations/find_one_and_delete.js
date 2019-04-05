'use strict';

const OperationBase = require('./operation').OperationBase;
const findAndModify = require('./common_functions').findAndModify;

class FindOneAndDeleteOperation extends OperationBase {
  constructor(collection, filter, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;
    // Execute find and Modify
    findAndModify(coll, filter, options.sort, null, finalOptions, callback);
  }
}

module.exports = FindOneAndDeleteOperation;
