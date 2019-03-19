'use strict';

const OperationBase = require('./operation').OperationBase;
const findAndModify = require('./common_functions').findAndModify;

class FindOneAndUpdateOperation extends OperationBase {
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

    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new =
      typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
    finalOptions.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;

    // Execute findAndModify
    findAndModify(coll, filter, options.sort, update, finalOptions, callback);
  }
}

module.exports = FindOneAndUpdateOperation;
