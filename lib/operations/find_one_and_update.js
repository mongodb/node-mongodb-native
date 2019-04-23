'use strict';

const FindAndModifyOperation = require('./find_and_modify');

class FindOneAndUpdateOperation extends FindAndModifyOperation {
  constructor(collection, filter, update, options) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new =
      typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
    finalOptions.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;

    super(collection, filter, finalOptions.sort, update, finalOptions);
  }
}

module.exports = FindOneAndUpdateOperation;
