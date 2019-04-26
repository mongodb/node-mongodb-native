'use strict';

const CommandOperation = require('./command');

class StatsOperation extends CommandOperation {
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

module.exports = StatsOperation;
