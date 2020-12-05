'use strict';

const FindAndModifyOperation = require('./find_and_modify');
const hasAtomicOperators = require('../utils').hasAtomicOperators;

class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(collection, filter, replacement, options) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
    finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

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
