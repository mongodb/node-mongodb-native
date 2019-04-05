'use strict';

const OperationBase = require('./operation').OperationBase;
const findAndModify = require('./common_functions').findAndModify;

class FindOneAndReplaceOperation extends OperationBase {
  constructor(collection, filter, replacement, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
    this.replacement = replacement;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const replacement = this.replacement;
    const options = this.options;

    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
    finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

    // Execute findAndModify
    findAndModify(coll, filter, options.sort, replacement, finalOptions, callback);
  }
}

module.exports = FindOneAndReplaceOperation;
