'use strict';

const OperationBase = require('./operation').OperationBase;
const executeCommand = require('./db_ops').executeCommand;
const resolveReadPreference = require('../utils').resolveReadPreference;

class StatsOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

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
