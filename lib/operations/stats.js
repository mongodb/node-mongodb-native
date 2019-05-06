'use strict';

const OperationBase = require('./operation').OperationBase;
const executeCommand = require('./db_ops').executeCommand;
const resolveReadPreference = require('../utils').resolveReadPreference;

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
class StatsOperation extends OperationBase {
  /**
   * Construct a Stats operation.
   *
   * @param {Collection} a Collection instance.
   * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  /**
   * Execute the operation.
   *
   * @param {Collection~resultCallback} [callback] The collection result callback
   */
  execute(callback) {
    const coll = this.collection;
    let options = this.options;

    // Build command object
    const commandObject = {
      collStats: coll.collectionName
    };

    // Check if we have the scale value
    if (options['scale'] != null) commandObject['scale'] = options['scale'];

    options = Object.assign({}, options);
    // Ensure we have the right read preference inheritance
    options.readPreference = resolveReadPreference(coll, options);

    // Execute the command
    executeCommand(coll.s.db, commandObject, options, callback);
  }
}

module.exports = StatsOperation;
