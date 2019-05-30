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
    super(collection.s.db, options, collection);
  }

  _buildCommand() {
    const collection = this.collection;
    const options = this.options;

    // Build command object
    const command = {
      collStats: collection.collectionName
    };

    // Check if we have the scale value
    if (options['scale'] != null) {
      command['scale'] = options['scale'];
    }

    return command;
  }
}

defineAspects(StatsOperation, Aspect.READ_OPERATION);

module.exports = StatsOperation;
