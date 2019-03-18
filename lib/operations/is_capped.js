'use strict';

const OperationBase = require('./operation').OperationBase;
const OptionsOperation = require('./options_operation');
const handleCallback = require('../utils').handleCallback;

class IsCappedOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const options = this.options;

    const optionsOperation = new OptionsOperation(coll, options);

    optionsOperation.execute((err, document) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}

module.exports = IsCappedOperation;
