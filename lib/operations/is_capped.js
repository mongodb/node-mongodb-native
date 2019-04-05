'use strict';

const OptionsOperation = require('./options_operation');
const handleCallback = require('../utils').handleCallback;

class IsCappedOperation extends OptionsOperation {
  constructor(collection, options) {
    super(collection, options);
  }

  execute(callback) {
    super.execute((err, document) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}

module.exports = IsCappedOperation;
