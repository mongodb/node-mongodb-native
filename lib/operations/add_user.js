'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const applyWriteConcern = require('../utils').applyWriteConcern;
const CONSTANTS = require('../constants');
const count = require('./collection_ops').count;
const crypto = require('crypto');
const handleCallback = require('../utils').handleCallback;
const loadDb = require('../dynamic_loaders').loadDb;
const toError = require('../utils').toError;
const updateOne = require('./collection_ops').updateOne;
const WriteConcern = require('../write_concern');

class AddUserOperation extends CommandOperation {
  constructor(db, username, password, options) {
    options = options || {};

    // Special case where there is no password ($external users)
    if (typeof username === 'string' && password != null && typeof password === 'object') {
      options = password;
      password = null;
    }

    super(db, {}, options);

    this.username = username;
    this.password = password;
    this.finalOptions = Object.assign({}, options);
  }

  execute(callback) {
    const db = this.db;
    const username = this.username;
    const password = this.password;
    let finalOptions = this.finalOptions;

    let Db = loadDb();

    // Get additional values
    let roles = Array.isArray(finalOptions.roles) ? finalOptions.roles : [];

    // If not roles defined print deprecated message
    // TODO: handle deprecation properly
    if (roles.length === 0) {
      console.log('Creating a user without roles is deprecated in MongoDB >= 2.6');
    }

    // Check the db name and add roles if needed
    if (
      (db.databaseName.toLowerCase() === 'admin' || finalOptions.dbName === 'admin') &&
      !Array.isArray(finalOptions.roles)
    ) {
      roles = ['root'];
    } else if (!Array.isArray(finalOptions.roles)) {
      roles = ['dbOwner'];
    }

    // Get the error options
    const commandOptions = {};

    const writeConcern = WriteConcern.fromOptions(finalOptions);
    if (writeConcern != null) {
      commandOptions.writeConcern = writeConcern;
    }

    if (finalOptions.dbName) {
      commandOptions.dbName = finalOptions.dbName;
    }

    // Add maxTimeMS to options if set
    if (typeof finalOptions.maxTimeMS === 'number') {
      commandOptions.maxTimeMS = finalOptions.maxTimeMS;
    }

    const digestPassword = db.s.topology.lastIsMaster().maxWireVersion >= 7;

    let userPassword = password;

    if (!digestPassword) {
      // Use node md5 generator
      const md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ':mongo:' + password);
      userPassword = md5.digest('hex');
    }

    // Build the command to execute
    const command = {
      createUser: username,
      customData: finalOptions.customData || {},
      roles: roles,
      digestPassword
    };

    // No password
    if (typeof password === 'string') {
      command.pwd = userPassword;
    }

    // Error out if digestPassword set
    if (finalOptions.digestPassword != null) {
      return callback(
        toError(
          "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
        )
      );
    }

    // Attempt to execute auth command
    super.execute(command, (err, r) => {
      if (!err) {
        return handleCallback(callback, err, r);
      }

      if (err && err.ok === 0 && err.code === undefined) {
        // We need to perform the backward compatible insert operation
        finalOptions = applyWriteConcern(Object.assign({}, finalOptions), { db }, finalOptions);

        // Use node md5 generator
        const md5 = crypto.createHash('md5');
        // Generate keys used for authentication
        md5.update(username + ':mongo:' + password);
        const userPassword = md5.digest('hex');

        // If we have another db set
        const dbToUse = finalOptions.dbName
          ? new Db(finalOptions.dbName, db.s.topology, db.s.options)
          : db;

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

      return handleCallback(callback, err, null);
    });
  }
}

defineAspects(AddUserOperation, Aspect.WRITE_OPERATION);

module.exports = AddUserOperation;
