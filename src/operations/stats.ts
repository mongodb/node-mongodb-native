'use strict';
import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
class StatsOperation extends CommandOperation {
  /**
   * Construct a Stats operation.
   *
   * @param {Collection} collection Collection instance
   * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection: any, options?: object) {
    super(collection.s.db, options, collection);
  }

  _buildCommand() {
    const collection = this.collection;
    const options = this.options;

    // Build command object
    const command: any = {
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

export = StatsOperation;
