'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const maxWireVersion = require('../core/utils').maxWireVersion;
const ReadPreference = require('../core').ReadPreference;

/**
 * Creates one or more indexes on the collection.
 *
 * @class
 */
class CreateIndexesOperation extends CommandOperationV2 {
  /**
   * Construct a CreateIndexes operation.
   *
   * @param {Collection} collection parent collection
   * @param {string|object} indexSpecs Defines the indexes.
   * @param {object} [options] Optional settings. See Collection.prototype.createIndexes for a list of options.
   */
  constructor(collection, indexSpecs, options) {
    super(collection, options);
    this.collection = collection;
    this.indexSpecs = indexSpecs;
  }

  /**
   * Execute the operation.
   *
   * @param {any} server
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(server, callback) {
    const options = Object.assign({}, this.options, { readPreference: ReadPreference.PRIMARY });
    const indexSpecs = this.indexSpecs;

    const collationNotSupported = maxWireVersion(server) < 5;

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexSpecs.length; i++) {
      if (indexSpecs[i].name == null) {
        const keys = [];

        // Did the user pass in a collation, check if our write server supports it
        if (indexSpecs[i].collation && collationNotSupported) {
          return callback(new MongoError('server/primary/mongos does not support collation'));
        }

        for (let name in indexSpecs[i].key) {
          keys.push(`${name}_${indexSpecs[i].key[name]}`);
        }

        // Set the name
        indexSpecs[i].name = keys.join('_');
      }
    }

    const cmd = {
      createIndexes: this.collection.collectionName,
      indexes: indexSpecs
    };

    if (options.commitQuorum != null) {
      // Ensure commitQuorum not passed if server < 4.4
      if (maxWireVersion(server) < 9) {
        return callback(
          MongoError.create({
            message: '`commitQuorum` option for `createIndexes` not supported on servers < 4.4',
            driver: true
          })
        );
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    super.executeCommand(server, cmd, callback);
  }
}

defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexesOperation;
