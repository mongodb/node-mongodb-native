'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const loadCollection = require('../dynamic_loaders').loadCollection;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;

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
  'session'
];

class CreateCollectionOperation extends CommandOperation {
  constructor(db, name, options) {
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

    super(db, cmd, options);

    this.name = name;
  }

  execute(callback) {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    let Collection = loadCollection();

    // Get the write concern options
    const finalOptions = applyWriteConcern(Object.assign({}, options), { db }, options);

    // Did the user destroy the topology
    if (db.serverConfig && db.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    const listCollectionOptions = Object.assign({}, finalOptions, { nameOnly: true });

    // Check if we have the name
    db
      .listCollections({ name }, listCollectionOptions)
      .setReadPreference(ReadPreference.PRIMARY)
      .toArray((err, collections) => {
        if (err != null) return handleCallback(callback, err, null);
        if (collections.length > 0 && finalOptions.strict) {
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
