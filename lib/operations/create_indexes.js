'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;
const executeCommand = require('./db_ops').executeCommand;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;

class CreateIndexesOperation extends OperationBase {
  constructor(collection, indexSpecs, options) {
    super(options);

    this.collection = collection;
    this.indexSpecs = indexSpecs;
  }

  execute(callback) {
    const coll = this.collection;
    const indexSpecs = this.indexSpecs;
    let options = this.options;

    const capabilities = coll.s.topology.capabilities();

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexSpecs.length; i++) {
      if (indexSpecs[i].name == null) {
        const keys = [];

        // Did the user pass in a collation, check if our write server supports it
        if (indexSpecs[i].collation && capabilities && !capabilities.commandsTakeCollation) {
          return callback(new MongoError('server/primary/mongos does not support collation'));
        }

        for (let name in indexSpecs[i].key) {
          keys.push(`${name}_${indexSpecs[i].key[name]}`);
        }

        // Set the name
        indexSpecs[i].name = keys.join('_');
      }
    }

    options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

    // Execute the index
    executeCommand(
      coll.s.db,
      {
        createIndexes: coll.collectionName,
        indexes: indexSpecs
      },
      options,
      callback
    );
  }
}

defineAspects(CreateIndexesOperation, Aspect.WRITE_OPERATION);

module.exports = CreateIndexesOperation;
