'use strict';

const MongoError = require('../core').MongoError;
const FindAndModifyOperation = require('./find_and_modify');
const hasAtomicOperators = require('../utils').hasAtomicOperators;

class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(collection, filter, replacement, options) {
    if ('returnDocument' in options && 'returnOriginal' in options) {
      throw new MongoError(
        'findOneAndReplace option returnOriginal is deprecated in favor of returnDocument and cannot be combined'
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

    if (replacement == null || typeof replacement !== 'object') {
      throw new TypeError('Replacement parameter must be an object');
    }

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not contain atomic operators');
    }

    super(collection, filter, finalOptions.sort, replacement, finalOptions);
  }
}

module.exports = FindOneAndReplaceOperation;
