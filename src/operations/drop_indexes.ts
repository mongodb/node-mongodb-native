'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const DropIndexOperation = require('./drop_index');
const handleCallback = require('../utils').handleCallback;

class DropIndexesOperation extends DropIndexOperation {
  constructor(collection, options) {
    super(collection, '*', options);
  }

  execute(callback) {
    super.execute(err => {
      if (err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }
}

defineAspects(DropIndexesOperation, Aspect.WRITE_OPERATION);

module.exports = DropIndexesOperation;
