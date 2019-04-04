'use strict';

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

module.exports = DropIndexesOperation;
