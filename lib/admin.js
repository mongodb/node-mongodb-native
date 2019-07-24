'use strict';

const applyWriteConcern = require('./utils').applyWriteConcern;

const AddUserOperation = require('./operations/add_user');
const ExecuteDbAdminCommandOperation = require('./operations/execute_db_admin_command');
const RemoveUserOperation = require('./operations/remove_user');
const ValidateCollectionOperation = require('./operations/validate_collection');
const ListDatabasesOperation = require('./operations/list_databases');

const executeOperation = require('./operations/execute_operation');

/**
 * @fileOverview The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 *
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Use the admin database for the operation
 *   const adminDb = client.db(dbName).admin();
 *
 *   // List all the available databases
 *   adminDb.listDatabases(function(err, dbs) {
 *     test.equal(null, err);
 *     test.ok(dbs.databases.length > 0);
 *     client.close();
 *   });
 * });
 */

/**
 * Create a new Admin instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @return {Admin} a collection instance.
 */
function Admin(db, topology, promiseLibrary) {
  if (!(this instanceof Admin)) return new Admin(db, topology);

  // Internal state
  this.s = {
    db: db,
    topology: topology,
    promiseLibrary: promiseLibrary
  };
}

/**
 * The callback format for results
 * @callback Admin~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.command = function(command, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() : {};

  const commandOperation = new ExecuteDbAdminCommandOperation(this.s.db, command, options);

  return executeOperation(this.s.db.s.topology, commandOperation, callback);
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.buildInfo = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const cmd = { buildinfo: 1 };

  const buildInfoOperation = new ExecuteDbAdminCommandOperation(this.s.db, cmd, options);

  return executeOperation(this.s.db.s.topology, buildInfoOperation, callback);
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.serverInfo = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const cmd = { buildinfo: 1 };

  const serverInfoOperation = new ExecuteDbAdminCommandOperation(this.s.db, cmd, options);

  return executeOperation(this.s.db.s.topology, serverInfoOperation, callback);
};

/**
 * Retrieve this db's server status.
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.serverStatus = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const serverStatusOperation = new ExecuteDbAdminCommandOperation(
    this.s.db,
    { serverStatus: 1 },
    options
  );

  return executeOperation(this.s.db.s.topology, serverStatusOperation, callback);
};

/**
 * Ping the MongoDB server and retrieve results
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.ping = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const cmd = { ping: 1 };

  const pingOperation = new ExecuteDbAdminCommandOperation(this.s.db, cmd, options);

  return executeOperation(this.s.db.s.topology, pingOperation, callback);
};

/**
 * Add a user to the database.
 * @method
 * @param {string} username The username.
 * @param {string} password The password.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.fsync=false] Specify a file sync write concern.
 * @param {object} [options.customData] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.addUser = function(username, password, options, callback) {
  const args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  // Special case where there is no password ($external users)
  if (typeof username === 'string' && password != null && typeof password === 'object') {
    options = password;
    password = null;
  }

  options = args.length ? args.shift() : {};
  options = Object.assign({}, options);
  // Get the options
  options = applyWriteConcern(options, { db: this.s.db });
  // Set the db name to admin
  options.dbName = 'admin';

  const addUserOperation = new AddUserOperation(this.s.db, username, password, options);

  return executeOperation(this.s.db.s.topology, addUserOperation, callback);
};

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.fsync=false] Specify a file sync write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.removeUser = function(username, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  options = args.length ? args.shift() : {};
  options = Object.assign({}, options);
  // Get the options
  options = applyWriteConcern(options, { db: this.s.db });
  // Set the db name
  options.dbName = 'admin';

  const removeUserOperation = new RemoveUserOperation(this.s.db, username, options);

  return executeOperation(this.s.db.s.topology, removeUserOperation, callback);
};

/**
 * Validate an existing collection
 *
 * @param {string} collectionName The name of the collection to validate.
 * @param {object} [options] Optional settings.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.validateCollection = function(collectionName, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const validateCollectionOperation = new ValidateCollectionOperation(
    this,
    collectionName,
    options
  );

  return executeOperation(this.s.db.s.topology, validateCollectionOperation, callback);
};

/**
 * List the available databases
 *
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nameOnly=false] Whether the command should return only db names, or names and size info.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.listDatabases = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(
    this.s.db.s.topology,
    new ListDatabasesOperation(this.s.db, options),
    callback
  );
};

/**
 * Get ReplicaSet status
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Admin.prototype.replSetGetStatus = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const replSetGetStatusOperation = new ExecuteDbAdminCommandOperation(
    this.s.db,
    { replSetGetStatus: 1 },
    options
  );

  return executeOperation(this.s.db.s.topology, replSetGetStatusOperation, callback);
};

module.exports = Admin;
