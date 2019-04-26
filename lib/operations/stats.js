'use strict';

const CommandOperation = require('./command');

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
    // Build command object
    const commandObject = {
      collStats: collection.collectionName
    };

    // Check if we have the scale value
    if (options['scale'] != null) {
      commandObject['scale'] = options['scale'];
    }

    super(collection.s.db, commandObject, options, collection);
  }
}

defineAspects(StatsOperation, Aspect.READ_OPERATION);

module.exports = StatsOperation;
