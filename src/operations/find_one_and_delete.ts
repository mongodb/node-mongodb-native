'use strict';

const FindAndModifyOperation = require('./find_and_modify');

class FindOneAndDeleteOperation extends FindAndModifyOperation {
  constructor(collection, filter, options) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;

    super(collection, filter, finalOptions.sort, null, finalOptions);
  }
}

module.exports = FindOneAndDeleteOperation;
