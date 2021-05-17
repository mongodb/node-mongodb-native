'use strict';

const MongoError = require('../core').MongoError;
const FindAndModifyOperation = require('./find_and_modify');
const hasAtomicOperators = require('../utils').hasAtomicOperators;

class FindOneAndUpdateOperation extends FindAndModifyOperation {
  constructor(collection, filter, update, options) {
    if ('returnDocument' in options && 'returnOriginal' in options) {
      throw new MongoError(
        'findOneAndUpdate option returnOriginal is deprecated in favor of returnDocument and cannot be combined'
      );
    }
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnDocument === 'after' || options.returnOriginal === false;
    finalOptions.upsert = options.upsert === true;

    if (filter == null || typeof filter !== 'object') {
      throw new TypeError('Filter parameter must be an object');
    }

    if (update == null || typeof update !== 'object') {
      throw new TypeError('Update parameter must be an object');
    }

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    super(collection, filter, finalOptions.sort, update, finalOptions);
  }
}

module.exports = FindOneAndUpdateOperation;
