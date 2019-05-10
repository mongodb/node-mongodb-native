'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const CONSTANTS = require('../constants');
const findOne = require('./collection_ops').findOne;
const handleCallback = require('../utils').handleCallback;
const loadDb = require('../dynamic_loaders').loadDb;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;
const remove = require('./collection_ops').remove;

class RemoveUserOperation extends OperationBase {
  constructor(db, username, options) {
    super(options);

    this.db = db;
    this.username = username;
  }

  execute(callback) {
    const db = this.db;
    const username = this.username;
    const options = this.options;

    let Db = loadDb();

    // Attempt to execute command
    executeAuthRemoveUserCommand(db, username, options, (err, result) => {
      if (err && err.code === -5000) {
        const finalOptions = applyWriteConcern(Object.assign({}, options), { db }, options);
        // If we have another db set
        const db = options.dbName ? new Db(options.dbName, db.s.topology, db.s.options) : db;

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

      if (err) return handleCallback(callback, err);
      handleCallback(callback, err, result);
    });
  }
}

function executeAuthRemoveUserCommand(db, username, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Did the user destroy the topology
  if (db.serverConfig && db.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Get the error options
  const commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Get additional values
  const maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Build the command to execute
  let command = {
    dropUser: username
  };

  // Apply write concern to command
  command = applyWriteConcern(command, { db }, options);

  // Force write using primary
  commandOptions.readPreference = ReadPreference.primary;

  // Execute the command
  const commandOperation = new CommandOperation(db, command, commandOptions);
  commandOperation.execute((err, result) => {
    if (err && !err.ok && err.code === undefined) return handleCallback(callback, { code: -5000 });
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}

module.exports = RemoveUserOperation;
