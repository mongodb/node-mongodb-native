'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperation = require('./command');
const buildCountCommand = require('./common_functions').buildCountCommand;
const handleCallback = require('../utils').handleCallback;

class EstimatedDocumentCountOperation extends CommandOperation {
  constructor(collection, options) {
    super(collection.s.db, options, collection);
  }

  _buildCommand() {
    const coll = this.collection;
    let options = this.options;

    options.collectionName = coll.collectionName;

    return buildCountCommand(coll, null, options);
  }

  execute(callback) {
    super.execute((err, result) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.n);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, Aspect.READ_OPERATION);

module.exports = EstimatedDocumentCountOperation;
