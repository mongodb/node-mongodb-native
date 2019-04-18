'use strict';

const OperationBase = require('./operation').OperationBase;
const buildCountCommand = require('./common_functions').buildCountCommand;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const resolveReadPreference = require('../utils').resolveReadPreference;

class EstimatedDocumentCountOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, options);
    options.collectionName = coll.collectionName;

    options.readPreference = resolveReadPreference(options, {
      db: coll.s.db,
      collection: coll
    });

    let cmd;
    try {
      cmd = buildCountCommand(coll, null, options);
    } catch (err) {
      return callback(err);
    }

    executeCommand(coll.s.db, cmd, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.n);
    });
  }
}

module.exports = EstimatedDocumentCountOperation;
