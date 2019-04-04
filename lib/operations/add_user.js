'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');
const applyWriteConcern = require('../utils').applyWriteConcern;
const CONSTANTS = require('../constants');
const count = require('./collection_ops').count;
const crypto = require('crypto');
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;
const updateOne = require('./collection_ops').updateOne;

let db;
function loadDb() {
  if (!db) {
    db = require('../db');
  }
  return db;
}

class AddUserOperation extends OperationBase {
  constructor(db, username, password, options) {
    super(options);

    this.db = db;
    this.username = username;
    this.password = password;
  }

  execute(callback) {
    const db = this.db;
    const username = this.username;
    const password = this.password;
    const options = this.options;

    let Db = loadDb();

    // Did the user destroy the topology
    if (db.serverConfig && db.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }
    // Attempt to execute auth command
    executeAuthCreateUserCommand(db, username, password, options, (err, r) => {
      // We need to perform the backward compatible insert operation
      if (err && err.code === -5000) {
        const finalOptions = applyWriteConcern(Object.assign({}, options), { db }, options);

        // Use node md5 generator
        const md5 = crypto.createHash('md5');
        // Generate keys used for authentication
        md5.update(username + ':mongo:' + password);
        const userPassword = md5.digest('hex');

        // If we have another db set
        const dbToUse = options.dbName ? new Db(options.dbName, db.s.topology, db.s.options) : db;

        // Fetch a user collection
        const collection = dbToUse.collection(CONSTANTS.SYSTEM_USER_COLLECTION);

        // Check if we are inserting the first user
        count(collection, {}, finalOptions, (err, count) => {
          // We got an error (f.ex not authorized)
          if (err != null) return handleCallback(callback, err, null);
          // Check if the user exists and update i
          const findOptions = Object.assign({ projection: { dbName: 1 } }, finalOptions);
          collection.find({ user: username }, findOptions).toArray(err => {
            // We got an error (f.ex not authorized)
            if (err != null) return handleCallback(callback, err, null);
            // Add command keys
            finalOptions.upsert = true;

            // We have a user, let's update the password or upsert if not
            updateOne(
              collection,
              { user: username },
              { $set: { user: username, pwd: userPassword } },
              finalOptions,
              err => {
                if (count === 0 && err)
                  return handleCallback(callback, null, [{ user: username, pwd: userPassword }]);
                if (err) return handleCallback(callback, err, null);
                handleCallback(callback, null, [{ user: username, pwd: userPassword }]);
              }
            );
          });
        });

        return;
      }

      if (err) return handleCallback(callback, err);
      handleCallback(callback, err, r);
    });
  }
}

function executeAuthCreateUserCommand(db, username, password, options, callback) {
  // Special case where there is no password ($external users)
  if (typeof username === 'string' && password != null && typeof password === 'object') {
    options = password;
    password = null;
  }

  // Unpack all options
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // Error out if we digestPassword set
  if (options.digestPassword != null) {
    return callback(
      toError(
        "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
      )
    );
  }

  // Get additional values
  const customData = options.customData != null ? options.customData : {};
  let roles = Array.isArray(options.roles) ? options.roles : [];
  const maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // If not roles defined print deprecated message
  if (roles.length === 0) {
    console.log('Creating a user without roles is deprecated in MongoDB >= 2.6');
  }

  // Get the error options
  const commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Check the db name and add roles if needed
  if (
    (db.databaseName.toLowerCase() === 'admin' || options.dbName === 'admin') &&
    !Array.isArray(options.roles)
  ) {
    roles = ['root'];
  } else if (!Array.isArray(options.roles)) {
    roles = ['dbOwner'];
  }

  const digestPassword = db.s.topology.lastIsMaster().maxWireVersion >= 7;

  // Build the command to execute
  let command = {
    createUser: username,
    customData: customData,
    roles: roles,
    digestPassword
  };

  // Apply write concern to command
  command = applyWriteConcern(command, { db }, options);

  let userPassword = password;

  if (!digestPassword) {
    // Use node md5 generator
    const md5 = crypto.createHash('md5');
    // Generate keys used for authentication
    md5.update(username + ':mongo:' + password);
    userPassword = md5.digest('hex');
  }

  // No password
  if (typeof password === 'string') {
    command.pwd = userPassword;
  }

  // Force write using primary
  commandOptions.readPreference = ReadPreference.primary;

  // Execute the command
  const commandOperation = new CommandOperation(db, command, commandOptions);
  commandOperation.execute((err, result) => {
    if (err && err.ok === 0 && err.code === undefined)
      return handleCallback(callback, { code: -5000 }, null);
    if (err) return handleCallback(callback, err, null);
    handleCallback(
      callback,
      !result.ok ? toError(result) : null,
      result.ok ? [{ user: username, pwd: '' }] : null
    );
  });
}

module.exports = AddUserOperation;
