'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const loadCollection = require('../dynamic_loaders').loadCollection;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;

const ILLEGAL_COMMAND_FIELDS = new Set([
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
]);

class CreateCollectionOperation extends CommandOperation {
  constructor(db, name, options) {
    super(db, options);
    this.name = name;
  }

  _buildCommand() {
    const name = this.name;
    const options = this.options;

    const cmd = { create: name };
    for (let n in options) {
      if (
        options[n] != null &&
        typeof options[n] !== 'function' &&
        !ILLEGAL_COMMAND_FIELDS.has(n)
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
    const Collection = loadCollection();

    let listCollectionOptions = Object.assign({ nameOnly: true, strict: false }, options);
    listCollectionOptions = applyWriteConcern(listCollectionOptions, { db }, listCollectionOptions);

    function done(err) {
      if (err) {
        return callback(err);
      }

      try {
        callback(
          null,
          new Collection(db, db.s.topology, db.databaseName, name, db.s.pkFactory, options)
        );
      } catch (err) {
        callback(err);
      }
    }

    const strictMode = listCollectionOptions.strict;
    if (strictMode) {
      db.listCollections({ name }, listCollectionOptions)
        .setReadPreference(ReadPreference.PRIMARY)
        .toArray((err, collections) => {
          if (err) {
            return callback(err);
          }

          if (collections.length > 0) {
            return callback(
              new MongoError(`Collection ${name} already exists. Currently in strict mode.`)
            );
          }

          super.execute(done);
        });

      return;
    }

    // otherwise just execute the command
    super.execute(done);
  }
}

defineAspects(CreateCollectionOperation, Aspect.WRITE_OPERATION);
module.exports = CreateCollectionOperation;
