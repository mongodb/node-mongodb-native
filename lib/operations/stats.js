'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
class StatsOperation extends CommandOperation {
  /**
   * Construct a Stats operation.
   *
   * @param {Collection} a Collection instance.
   * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection, options) {
    super(collection.s.db, {}, options, collection);

    this.collection = collection;
  }

  execute(callback) {
    const collection = this.collection;
    const options = this.options;

    // Build command object
    const commandObject = {
      collStats: collection.collectionName
    };

    // Check if we have the scale value
    if (options['scale'] != null) {
      commandObject['scale'] = options['scale'];
    }

    super.execute(commandObject, callback);
  }
}

defineAspects(StatsOperation, Aspect.READ_OPERATION);

module.exports = StatsOperation;
