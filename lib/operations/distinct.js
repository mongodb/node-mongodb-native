'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const resolveReadPreference = require('../utils').resolveReadPreference;

class DistinctOperation extends OperationBase {
  constructor(collection, key, query, options) {
    super(options);

    this.collection = collection;
    this.key = key;
    this.query = query;
  }

  execute(callback) {
    const coll = this.collection;
    const key = this.key;
    const query = this.query;
    let options = this.options;

    // maxTimeMS option
    const maxTimeMS = options.maxTimeMS;

    // Distinct command
    const cmd = {
      distinct: coll.collectionName,
      key: key,
      query: query
    };

    options = Object.assign({}, options);
    // Ensure we have the right read preference inheritance
    options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

    // Add maxTimeMS if defined
    if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;

    // Do we have a readConcern specified
    decorateWithReadConcern(cmd, coll, options);

    // Have we specified collation
    try {
      decorateWithCollation(cmd, coll, options);
    } catch (err) {
      return callback(err, null);
    }

    // Execute the command
    executeCommand(coll.s.db, cmd, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.values);
    });
  }
}

defineAspects(DistinctOperation, Aspect.READ_OPERATION);

module.exports = DistinctOperation;
