'use strict';

const Operation = require('./operation').Operation;
const OptionsOperation = require('./options_operation');
const handleCallback = require('../utils').handleCallback;

class IsCappedOperation extends Operation {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    const options = this.options;

    const optionsOperation = new OptionsOperation(coll, options);

    optionsOperation.execute(coll, options, (err, document) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}

module.exports = IsCappedOperation;
