'use strict';

const FindAndModifyOperation = require('./find_and_modify');

class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(collection, filter, replacement, options) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
    finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

    super(collection, filter, finalOptions.sort, replacement, finalOptions);
  }
}

module.exports = FindOneAndReplaceOperation;
