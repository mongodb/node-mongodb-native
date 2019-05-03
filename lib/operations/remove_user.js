'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const applyWriteConcern = require('../utils').applyWriteConcern;
const CONSTANTS = require('../constants');
const findOne = require('./collection_ops').findOne;
const handleCallback = require('../utils').handleCallback;
const loadDb = require('../dynamic_loaders').loadDb;
const remove = require('./collection_ops').remove;
const WriteConcern = require('../write_concern');

class RemoveUserOperation extends CommandOperation {
  constructor(db, username, options) {
    const commandOptions = {};

    const writeConcern = WriteConcern.fromOptions(options);
    if (writeConcern != null) {
      commandOptions.writeConcern = writeConcern;
    }

    if (options['dbName']) {
      commandOptions.dbName = options['dbName'];
    }

    // Get additional values
    const maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

    // Add maxTimeMS to options if set
    if (maxTimeMS != null) {
      commandOptions.maxTimeMS = maxTimeMS;
    }

    // Build the command to execute
    let command = { dropUser: username };

    super(db, command, commandOptions);

    this.username = username;
    this.finalOptions = Object.assign({}, options);
  }

  execute(callback) {
    const username = this.username;
    let finalOptions = this.finalOptions;

    let Db = loadDb();

    // Attempt to execute command
    super.execute((err, result) => {
      if (err && !err.ok && err.code === undefined) {
        finalOptions = applyWriteConcern(
          Object.assign({}, finalOptions),
          { db: this.db },
          finalOptions
        );
        // If we have another db set
        const db = finalOptions.dbName
          ? new Db(finalOptions.dbName, db.s.topology, db.s.options)
          : db;

        // Fetch a user collection
        const collection = db.collection(CONSTANTS.SYSTEM_USER_COLLECTION);

        // Locate the user
        findOne(collection, { user: username }, finalOptions, (err, user) => {
          if (user == null) return handleCallback(callback, err, false);
          remove(collection, { user: username }, finalOptions, err => {
            handleCallback(callback, err, true);
          });
        });

        return;
      }

      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, err, result.ok ? true : false);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.SKIP_SESSIONS]);

module.exports = RemoveUserOperation;
