'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;

/**
 * Return a list of distinct values for the given key across a collection.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {string} key Field of the document to find distinct values for.
 * @property {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @property {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
 */
class DistinctOperation extends CommandOperationV2 {
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
  execute(server, callback) {
    const coll = this.collection;
    const key = this.key;
    const query = this.query;
    const options = this.options;

    // Distinct command
    const cmd = {
      distinct: coll.collectionName,
      key: key,
      query: query
    };

    // Add maxTimeMS if defined
    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    // Do we have a readConcern specified
    decorateWithReadConcern(cmd, coll, options);

    // Have we specified collation
    try {
      decorateWithCollation(cmd, coll, options);
    } catch (err) {
      return callback(err, null);
    }

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.options.full ? result : result.values);
    });
  }
}

defineAspects(DistinctOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = DistinctOperation;
