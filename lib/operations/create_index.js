'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;
const parseIndexOptions = require('../utils').parseIndexOptions;

const keysToOmit = new Set([
  'name',
  'key',
  'writeConcern',
  'w',
  'wtimeout',
  'j',
  'fsync',
  'readPreference',
  'session'
]);

class CreateIndexOperation extends CommandOperation {
  constructor(db, name, fieldOrSpec, options) {
    super(db, options);

    this.name = name;
    this.fieldOrSpec = fieldOrSpec;
  }

  _buildCommand() {
    const name = this.name;
    const fieldOrSpec = this.fieldOrSpec;
    const options = this.options;

    // Build the index
    const indexParameters = parseIndexOptions(fieldOrSpec);
    // Generate the index name
    const indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
    // Set up the index
    const indexesObject = { name: indexName, key: indexParameters.fieldHash };
    // merge all the options
    for (let optionName in options) {
      if (!keysToOmit.has(optionName)) {
        indexesObject[optionName] = options[optionName];
      }
    }

    this.indexName = indexName;

    // Create command, apply write concern to command
    const cmd = { createIndexes: name, indexes: [indexesObject] };

    return cmd;
  }

  execute(callback) {
    const db = this.db;
    const options = this.options;

    // Get capabilities
    const capabilities = db.s.topology.capabilities();

    // Did the user pass in a collation, check if our write server supports it
    if (options.collation && capabilities && !capabilities.commandsTakeCollation) {
      // Create a new error
      const error = new MongoError('server/primary/mongos does not support collation');
      error.code = 67;
      // Return the error
      return callback(error);
    }

    // Ensure we have a callback
    if (options.writeConcern && typeof callback !== 'function') {
      throw MongoError.create({
        message: 'Cannot use a writeConcern without a provided callback',
        driver: true
      });
    }

    // Attempt to run using createIndexes command
    super.execute((err, result) => {
      if (err == null) return handleCallback(callback, err, this.indexName);

      return handleCallback(callback, err, result);
    });
  }
}

defineAspects(CreateIndexOperation, Aspect.WRITE_OPERATION);

module.exports = CreateIndexOperation;
