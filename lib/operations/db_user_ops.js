'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const crypto = require('crypto');
const Db = require('../db');
const executeCommand = require('./db_execute_commands').executeCommand;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const shallowClone = require('../utils').shallowClone;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;

function _executeAuthCreateUserCommand(self, username, password, options, callback) {
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
    throw toError(
      "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
    );
  }

  // Get additional values
  var customData = options.customData != null ? options.customData : {};
  var roles = Array.isArray(options.roles) ? options.roles : [];
  var maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // If not roles defined print deprecated message
  if (roles.length === 0) {
    console.log('Creating a user without roles is deprecated in MongoDB >= 2.6');
  }

  // Get the error options
  var commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Check the db name and add roles if needed
  if (
    (self.databaseName.toLowerCase() === 'admin' || options.dbName === 'admin') &&
    !Array.isArray(options.roles)
  ) {
    roles = ['root'];
  } else if (!Array.isArray(options.roles)) {
    roles = ['dbOwner'];
  }

  const digestPassword = self.s.topology.lastIsMaster().maxWireVersion >= 7;

  // Build the command to execute
  var command = {
    createUser: username,
    customData: customData,
    roles: roles,
    digestPassword
  };

  // Apply write concern to command
  command = applyWriteConcern(command, { db: self }, options);

  let userPassword = password;

  if (!digestPassword) {
    // Use node md5 generator
    let md5 = crypto.createHash('md5');
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
  executeCommand(self, command, commandOptions, function(err, result) {
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

function _executeAuthRemoveUserCommand(self, username, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Get the error options
  var commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Get additional values
  var maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Build the command to execute
  var command = {
    dropUser: username
  };

  // Apply write concern to command
  command = applyWriteConcern(command, { db: self }, options);

  // Force write using primary
  commandOptions.readPreference = ReadPreference.primary;

  // Execute the command
  executeCommand(self, command, commandOptions, function(err, result) {
    if (err && !err.ok && err.code === undefined) return handleCallback(callback, { code: -5000 });
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}

function addUser(self, username, password, options, callback) {
  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Attempt to execute auth command
  _executeAuthCreateUserCommand(self, username, password, options, function(err, r) {
    // We need to perform the backward compatible insert operation
    if (err && err.code === -5000) {
      var finalOptions = applyWriteConcern(shallowClone(options), { db: self }, options);

      // Use node md5 generator
      var md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ':mongo:' + password);
      var userPassword = md5.digest('hex');

      // If we have another db set
      var db = options.dbName ? new Db(options.dbName, self.s.topology, self.s.options) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

      // Check if we are inserting the first user
      collection.count({}, finalOptions, function(err, count) {
        // We got an error (f.ex not authorized)
        if (err != null) return handleCallback(callback, err, null);
        // Check if the user exists and update i
        collection
          .find({ user: username }, { dbName: options['dbName'] }, finalOptions)
          .toArray(function(err) {
            // We got an error (f.ex not authorized)
            if (err != null) return handleCallback(callback, err, null);
            // Add command keys
            finalOptions.upsert = true;

            // We have a user, let's update the password or upsert if not
            collection.update(
              { user: username },
              { $set: { user: username, pwd: userPassword } },
              finalOptions,
              function(err) {
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

function removeUser(self, username, options, callback) {
  // Attempt to execute command
  _executeAuthRemoveUserCommand(self, username, options, function(err, result) {
    if (err && err.code === -5000) {
      var finalOptions = applyWriteConcern(shallowClone(options), { db: self }, options);
      // If we have another db set
      var db = options.dbName ? new Db(options.dbName, self.s.topology, self.s.options) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

      // Locate the user
      collection.findOne({ user: username }, finalOptions, function(err, user) {
        if (user == null) return handleCallback(callback, err, false);
        collection.remove({ user: username }, finalOptions, function(err) {
          handleCallback(callback, err, true);
        });
      });

      return;
    }

    if (err) return handleCallback(callback, err);
    handleCallback(callback, err, result);
  });
}

exports.addUser = addUser;
exports.removeUser = removeUser;
