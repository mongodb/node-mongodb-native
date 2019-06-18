'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const loadCollection = require('../dynamic_loaders').loadCollection;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;

// Filter out any write concern options
const illegalCommandFields = [
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'strict',
  'serializeFunctions',
  'pkFactory',
  'raw',
  'readPreference',
  'session',
  'readConcern',
  'writeConcern'
];

class CreateCollectionOperation extends CommandOperation {
  constructor(db, name, options) {
    super(db, options);

    this.name = name;
  }

  _buildCommand() {
    const name = this.name;
    const options = this.options;

    // Create collection command
    const cmd = { create: name };
    // Add all optional parameters
    for (let n in options) {
      if (
        options[n] != null &&
        typeof options[n] !== 'function' &&
        illegalCommandFields.indexOf(n) === -1
      ) {
        cmd[n] = options[n];
      }
    }

    return cmd;
  }

  execute(callback) {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    let Collection = loadCollection();

    // Did the user destroy the topology
    if (db.serverConfig && db.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    let listCollectionOptions = Object.assign({}, options, { nameOnly: true });
    listCollectionOptions = applyWriteConcern(listCollectionOptions, { db }, listCollectionOptions);

    // Check if we have the name
    db
      .listCollections({ name }, listCollectionOptions)
      .setReadPreference(ReadPreference.PRIMARY)
      .toArray((err, collections) => {
        if (err != null) return handleCallback(callback, err, null);
        if (collections.length > 0 && listCollectionOptions.strict) {
          return handleCallback(
            callback,
            MongoError.create({
              message: `Collection ${name} already exists. Currently in strict mode.`,
              driver: true
            }),
            null
          );
        } else if (collections.length > 0) {
          try {
            return handleCallback(
              callback,
              null,
              new Collection(db, db.s.topology, db.databaseName, name, db.s.pkFactory, options)
            );
          } catch (err) {
            return handleCallback(callback, err);
          }
        }

        // Execute command
        super.execute(err => {
          if (err) return handleCallback(callback, err);

          try {
            return handleCallback(
              callback,
              null,
              new Collection(db, db.s.topology, db.databaseName, name, db.s.pkFactory, options)
            );
          } catch (err) {
            return handleCallback(callback, err);
          }
        });
      });
  }
}

defineAspects(CreateCollectionOperation, Aspect.WRITE_OPERATION);

module.exports = CreateCollectionOperation;
