'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBaseV2 = require('./operation').OperationBaseV2;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const resolveReadPreference = require('../utils').resolveReadPreference;

/**
 * Return a list of distinct values for the given key across a collection.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {string} key Field of the document to find distinct values for.
 * @property {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @property {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
 */
class DistinctOperation extends OperationBaseV2 {
  /**
   * Construct a Distinct operation.
   *
   * @param {Collection} a Collection instance.
   * @param {string} key Field of the document to find distinct values for.
   * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
   * @param {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
   */
  constructor(collection, key, query, options) {
    super(collection, options);

    this.collection = collection;
    this.key = key;
    this.query = query;
  }

  /**
   * Execute the operation.
   *
   * @param {Collection~resultCallback} [callback] The command result callback
   */
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
    options.readPreference = resolveReadPreference(coll, options);

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
