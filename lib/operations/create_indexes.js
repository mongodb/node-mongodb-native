'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const serverLacksFeature = require('../utils').serverLacksFeature;
const parseIndexOptions = require('../utils').parseIndexOptions;

const validIndexOptions = new Set([
  'unique',
  'partialFilterExpression',
  'sparse',
  'background',
  'expireAfterSeconds',
  'storageEngine',
  'collation'
]);

class CreateIndexesOperation extends CommandOperationV2 {
  /**
   * @ignore
   */
  constructor(parent, collection, indexSpecs, options) {
    super(parent, options);
    this.collection = collection;
    this.indexSpecs = indexSpecs;
  }

  /**
   * @ignore
   */
  execute(server, callback) {
    let singular = false;
    if (!Array.isArray(this.indexSpecs)) {
      singular = true;
      const options = this.options;
      const indexParameters = parseIndexOptions(this.indexSpecs);
      // Generate the index name
      const name = typeof options.name === 'string' ? options.name : indexParameters.name;
      // Set up the index
      const indexes = { name, key: indexParameters.fieldHash };
      // merge all the options
      for (let optionName in options) {
        if (validIndexOptions.has(optionName)) {
          indexes[optionName] = options[optionName];
        }
      }
      this.indexSpecs = [indexes];
    }
    const options = this.options;
    const indexSpecs = this.indexSpecs;

    const collationNotSupported = serverLacksFeature(server, 'collation');
    const commitQuorumNotSupported = serverLacksFeature(server, 'commitQuorum');

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexSpecs.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexSpecs[i].collation && collationNotSupported) {
        callback(new MongoError(collationNotSupported));
        return;
      }

      if (indexSpecs[i].name == null) {
        const keys = [];

        for (let name in indexSpecs[i].key) {
          keys.push(`${name}_${indexSpecs[i].key[name]}`);
        }

        // Set the name
        indexSpecs[i].name = keys.join('_');
      }
    }

    const cmd = {
      createIndexes: this.collection,
      indexes: indexSpecs
    };

    if (options.commitQuorum != null) {
      // Ensure commitQuorum not passed if server < 4.4
      if (commitQuorumNotSupported) {
        return callback(new MongoError(commitQuorumNotSupported));
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, singular ? indexSpecs[0].name : result);
    });
  }
}

defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexesOperation;
