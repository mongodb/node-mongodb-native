'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandCursor = require('../command_cursor');
const MongoError = require('../core').MongoError;
const resolveReadPreference = require('../utils').resolveReadPreference;

class ListIndexesOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute() {
    const coll = this.collection;
    let options = this.options;

    options = options || {};
    // Clone the options
    options = Object.assign({}, options);
    // Determine the read preference in the options.
    options.readPreference = resolveReadPreference(coll, options);
    // Set the CommandCursor constructor
    options.cursorFactory = CommandCursor;
    // Set the promiseLibrary
    options.promiseLibrary = coll.s.promiseLibrary;

    if (!coll.s.topology.capabilities()) {
      throw new MongoError('cannot connect to server');
    }

    // Cursor options
    let cursor = options.batchSize ? { batchSize: options.batchSize } : {};

    // We have a list collections command
    if (coll.s.topology.capabilities().hasListIndexesCommand) {
      // Build the command
      const command = { listIndexes: coll.collectionName, cursor: cursor };
      // Execute the cursor
      cursor = coll.s.topology.cursor(
        coll.s.namespace.withCollection('$cmd').toString(),
        command,
        options
      );
      // Do we have a readPreference, apply it
      if (options.readPreference) cursor.setReadPreference(options.readPreference);
      // Return the cursor
      return cursor;
    }

    // Get the namespace
    const namespace = coll.s.namespace.withCollection('system.indexes');
    const ns = namespace.toString();
    // Get the query
    cursor = coll.s.topology.cursor(ns, { find: ns, query: { ns: coll.namespace } }, options);
    // Do we have a readPreference, apply it
    if (options.readPreference) cursor.setReadPreference(options.readPreference);
    // Set the passed in batch size if one was provided
    if (options.batchSize) cursor = cursor.batchSize(options.batchSize);
    // Return the cursor
    return cursor;
  }
}

module.exports = ListIndexesOperation;
