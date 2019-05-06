'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const CONSTANTS = require('../constants');
const defineAspects = require('./operation').defineAspects;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const parseIndexOptions = require('../utils').parseIndexOptions;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;

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

    // Create command, apply write concern to command
    const cmd = { createIndexes: name, indexes: [indexesObject] };

    super(db, cmd, options);

    this.name = name;
    this.fieldOrSpec = fieldOrSpec;
    this.indexes = indexesObject;
  }

  execute(callback) {
    const db = this.db;
    const name = this.name;
    const fieldOrSpec = this.fieldOrSpec;
    let options = this.options;
    const indexes = this.indexes;

    // Get capabilities
    const capabilities = db.s.topology.capabilities();

    // Did the user pass in a collation, check if our write server supports it
    if (indexes.collation && capabilities && !capabilities.commandsTakeCollation) {
      // Create a new error
      const error = new MongoError('server/primary/mongos does not support collation');
      error.code = 67;
      // Return the error
      return callback(error);
    }

    // Get the write concern options
    options = Object.assign({ readPreference: ReadPreference.PRIMARY }, options);
    options = applyWriteConcern(options, { db }, options);

    // Ensure we have a callback
    if (options.writeConcern && typeof callback !== 'function') {
      throw MongoError.create({
        message: 'Cannot use a writeConcern without a provided callback',
        driver: true
      });
    }

    // Attempt to run using createIndexes command
    super.execute((err, result) => {
      if (err == null) return handleCallback(callback, err, indexes.name);

      /**
       * The following errors mean that the server recognized `createIndex` as a command so we don't need to fallback to an insert:
       * 67 = 'CannotCreateIndex' (malformed index options)
       * 85 = 'IndexOptionsConflict' (index already exists with different options)
       * 86 = 'IndexKeySpecsConflict' (index already exists with the same name)
       * 11000 = 'DuplicateKey' (couldn't build unique index because of dupes)
       * 11600 = 'InterruptedAtShutdown' (interrupted at shutdown)
       * 197 = 'InvalidIndexSpecificationOption' (`_id` with `background: true`)
       */
      if (
        err.code === 67 ||
        err.code === 11000 ||
        err.code === 85 ||
        err.code === 86 ||
        err.code === 11600 ||
        err.code === 197
      ) {
        return handleCallback(callback, err, result);
      }

      if (result && result.ok === 0) return handleCallback(callback, toError(result), null);

      // Create command
      const doc = createCreateIndexCommand(db, name, fieldOrSpec, options);
      // Set no key checking
      options.checkKeys = false;
      // Insert document
      db.s.topology.insert(
        db.s.namespace.withCollection(CONSTANTS.SYSTEM_INDEX_COLLECTION),
        doc,
        options,
        (err, result) => {
          if (callback == null) return;
          if (err) return handleCallback(callback, err);
          if (result == null) return handleCallback(callback, null, null);
          if (result.result.writeErrors)
            return handleCallback(callback, MongoError.create(result.result.writeErrors[0]), null);
          handleCallback(callback, null, doc.name);
        }
      );
    });
  }
}

/**
 * Create the command object for Db.prototype.createIndex.
 *
 * @param {Db} db The Db instance on which to create the command.
 * @param {string} name Name of the collection to create the index on.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {Object} [options] Optional settings. See Db.prototype.createIndex for a list of options.
 * @return {Object} The insert command object.
 */
function createCreateIndexCommand(db, name, fieldOrSpec, options) {
  const indexParameters = parseIndexOptions(fieldOrSpec);
  const fieldHash = indexParameters.fieldHash;

  // Generate the index name
  const indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
  const selector = {
    ns: db.s.namespace.withCollection(name).toString(),
    key: fieldHash,
    name: indexName
  };

  // Ensure we have a correct finalUnique
  const finalUnique = options == null || 'object' === typeof options ? false : options;
  // Set up options
  options = options == null || typeof options === 'boolean' ? {} : options;

  // Add all the options
  const keysToOmit = Object.keys(selector);
  for (let optionName in options) {
    if (keysToOmit.indexOf(optionName) === -1) {
      selector[optionName] = options[optionName];
    }
  }

  if (selector['unique'] == null) selector['unique'] = finalUnique;

  // Remove any write concern operations
  const removeKeys = ['w', 'wtimeout', 'j', 'fsync', 'readPreference', 'session'];
  for (let i = 0; i < removeKeys.length; i++) {
    delete selector[removeKeys[i]];
  }

  // Return the command creation selector
  return selector;
}

defineAspects(CreateIndexOperation, [Aspect.WRITE_OPERATION]);

module.exports = CreateIndexOperation;
