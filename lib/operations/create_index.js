'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const parseIndexOptions = require('../utils').parseIndexOptions;
const MongoError = require('../error').MongoError;
const decorateWithCollation = require('../utils').decorateWithCollation;
const maxWireVersion = require('../core/utils').maxWireVersion;

const keysToOmit = new Set([
  'name',
  'key',
  'commitQuorum',
  'writeConcern',
  'w',
  'wtimeout',
  'j',
  'fsync',
  'readPreference',
  'session'
]);

/**
 * Creates an index on the collection.
 *
 * @class
 */
class CreateIndexOperation extends CommandOperationV2 {
  /**
   * Construct a CreateIndex operation.
   *
   * @param {Collection} collection Collection instance.
   * @param {string|object} fieldOrSpec Defines the index.
   * @param {object} [options] Optional settings. See Collection.prototype.createIndex for a list of options.
   */
  constructor(collection, fieldOrSpec, options) {
    super(collection, options);

    this.collection = collection;
    this.name = collection.collectionName;

    // Build the index
    const indexParameters = parseIndexOptions(fieldOrSpec);
    // Generate the index name
    const indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
    // Set up the index
    this.indexes = { name: indexName, key: indexParameters.fieldHash };
  }

  /**
   * Execute the operation.
   *
   * @param {any} server
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(server, callback) {
    const indexes = this.indexes;
    const options = this.options;
    const indexName = indexes.name;

    // merge all the options
    for (let optionName in options) {
      if (!keysToOmit.has(optionName)) {
        indexes[optionName] = options[optionName];
      }
    }

    const cmd = { createIndexes: this.name, indexes: [indexes] };

    // Ensure we have a callback
    if (options.writeConcern && typeof callback !== 'function') {
      throw MongoError.create({
        message: 'Cannot use a writeConcern without a provided callback',
        driver: true
      });
    }

    if (options.commitQuorum != null) {
      // Ensure commitQuorum not passed if server < 4.4
      if (maxWireVersion(server) < 9) {
        throw MongoError.create({
          message: '`commitQuorum` option for `createIndexes` not supported on servers < 4.4',
          driver: true
        });
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    // Have we specified collation
    try {
      decorateWithCollation(cmd, this.collection, options);
    } catch (err) {
      return callback(err, null);
    }

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.options.full ? result : indexName);
    });
  }
}

defineAspects(CreateIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexOperation;
