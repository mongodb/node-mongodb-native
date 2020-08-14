'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const parseIndexOptions = require('../utils').parseIndexOptions;
const maxWireVersion = require('../core/utils').maxWireVersion;

const VALID_INDEX_OPTIONS = new Set([
  'background',
  'unique',
  'name',
  'partialFilterExpression',
  'sparse',
  'expireAfterSeconds',
  'storageEngine',
  'collation',

  // text indexes
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',

  // 2d-sphere indexes
  '2dsphereIndexVersion',

  // 2d indexes
  'bits',
  'min',
  'max',

  // geoHaystack Indexes
  'bucketSize',

  // wildcard indexes
  'wildcardProjection'
]);

class CreateIndexesOperation extends CommandOperationV2 {
  /**
   * @ignore
   */
  constructor(parent, collection, indexes, options) {
    super(parent, options);
    this.collection = collection;

    // createIndex can be called with a variety of styles:
    //   coll.createIndex('a');
    //   coll.createIndex({ a: 1 });
    //   coll.createIndex([['a', 1]]);
    // createIndexes is always called with an array of index spec objects
    if (!Array.isArray(indexes) || Array.isArray(indexes[0])) {
      this.onlyReturnNameOfCreatedIndex = true;
      // TODO: remove in v4 (breaking change); make createIndex return full response as createIndexes does

      const indexParameters = parseIndexOptions(indexes);
      // Generate the index name
      const name = typeof options.name === 'string' ? options.name : indexParameters.name;
      // Set up the index
      const indexSpec = { name, key: indexParameters.fieldHash };
      // merge valid index options into the index spec
      for (let optionName in options) {
        if (VALID_INDEX_OPTIONS.has(optionName)) {
          indexSpec[optionName] = options[optionName];
        }
      }
      this.indexes = [indexSpec];
      return;
    }

    this.indexes = indexes;
  }

  /**
   * @ignore
   */
  execute(server, callback) {
    const options = this.options;
    const indexes = this.indexes;

    const serverWireVersion = maxWireVersion(server);

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexes.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexes[i].collation && serverWireVersion < 5) {
        callback(
          new MongoError(
            `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
          )
        );
        return;
      }

      if (indexes[i].name == null) {
        const keys = [];

        for (let name in indexes[i].key) {
          keys.push(`${name}_${indexes[i].key[name]}`);
        }

        // Set the name
        indexes[i].name = keys.join('_');
      }
    }

    const cmd = { createIndexes: this.collection, indexes };

    if (options.commitQuorum != null) {
      if (serverWireVersion < 9) {
        callback(
          new MongoError('`commitQuorum` option for `createIndexes` not supported on servers < 4.4')
        );
        return;
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    // collation is set on each index, it should not be defined at the root
    this.options.collation = undefined;

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.onlyReturnNameOfCreatedIndex ? indexes[0].name : result);
    });
  }
}

defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexesOperation;
