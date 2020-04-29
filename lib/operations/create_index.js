'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const parseIndexOptions = require('../utils').parseIndexOptions;
const MongoError = require('../error').MongoError;
const maxWireVersion = require('../core/utils').maxWireVersion;
const kCommand = Symbol('createIndexCommand');

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
   * @param {Db|Collection} parent
   * @param {string} name Collection name.
   * @param {string|object} fieldOrSpec Defines the index.
   * @param {object} [options] Optional settings. See Collection.prototype.createIndex for a list of options.
   */
  constructor(parent, name, fieldOrSpec, options) {
    super(parent, options);

    this.name = name;

    // Build the index
    const indexParameters = parseIndexOptions(fieldOrSpec);
    // Generate the index name
    this.indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
    // Set up the index
    const indexes = { name: this.indexName, key: indexParameters.fieldHash };

    // merge all the options
    for (let optionName in options) {
      if (!keysToOmit.has(optionName)) {
        indexes[optionName] = options[optionName];
      }
    }

    // build the command
    const cmd = { createIndexes: this.name, indexes: [indexes] };

    if (options.commitQuorum != null) {
      cmd.commitQuorum = options.commitQuorum;
    }

    this[kCommand] = cmd;
  }

  /**
   * Execute the operation.
   *
   * @param {any} server
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(server, callback) {
    // Ensure we have a callback
    if (this.options.writeConcern && typeof callback !== 'function') {
      throw MongoError.create({
        message: 'Cannot use a writeConcern without a provided callback',
        driver: true
      });
    }

    const cmd = this[kCommand];

    // Ensure commitQuorum not passed if server < 4.4
    if (cmd.commitQuorum != null && maxWireVersion(server) < 9) {
      throw MongoError.create({
        message: '`commitQuorum` option for `createIndexes` not supported on servers < 4.4',
        driver: true
      });
    }

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.options.full ? result : this.indexName);
    });
  }
}

defineAspects(CreateIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexOperation;
