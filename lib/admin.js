'use strict';

const executeOperation = require('./utils').executeOperation;
const applyWriteConcern = require('./utils').applyWriteConcern;

const addUser = require('./operations/db_ops').addUser;
const ClientSession = require('mongodb-core').Sessions.ClientSession;
const executeDbAdminCommand = require('./operations/db_ops').executeDbAdminCommand;
const ReadPreference = require('mongodb-core').ReadPreference;
const removeUser = require('./operations/db_ops').removeUser;
const replSetGetStatus = require('./operations/admin_ops').replSetGetStatus;
const resolveReadPreference = require('./utils').resolveReadPreference;
const serverStatus = require('./operations/admin_ops').serverStatus;
const validate = require('./options_validator').validate;
const validateCollection = require('./operations/admin_ops').validateCollection;

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

Object.defineProperty(Admin.prototype, 'optionsValidationLevel', {
  enumerable: true,
  get: function() {
    if (this.s && this.s.options && this.s.options.optionsValidationLevel) {
      return this.s.options.optionsValidationLevel;
    }
    return this.s.db.optionsValidationLevel;
  }
});

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
 * @param {ReadPreference|string} [options.readPreference] Specify read preference if command supports it
 * @param {ClientSession} [options.session] Session to use for the operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const commandSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Admin.prototype.command = function(command, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() : {};

  options = validate(
    commandSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.db.s.topology, executeDbAdminCommand.bind(this.s.db), [
    this.s.db,
    command,
    options,
    callback
  ]);
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ReadPreference|string} [options.readPreference] Specify read preference if command supports it
 * @param {ClientSession} [options.session] Session to use for the operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const buildInfoSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Admin.prototype.buildInfo = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    buildInfoSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  const cmd = { buildinfo: 1 };
  return executeOperation(this.s.db.s.topology, executeDbAdminCommand.bind(this.s.db), [
    this.s.db,
    cmd,
    options,
    callback
  ]);
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ReadPreference|string} [options.readPreference] Specify read preference if command supports it
 * @param {ClientSession} [options.session] Session to use for the operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const serverInfoSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Admin.prototype.serverInfo = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    serverInfoSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  const cmd = { buildinfo: 1 };
  return executeOperation(this.s.db.s.topology, executeDbAdminCommand.bind(this.s.db), [
    this.s.db,
    cmd,
    options,
    callback
  ]);
};

/**
 * Retrieve this db's server status.
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const serverStatusSchema = {
  session: { type: ClientSession }
};
Admin.prototype.serverStatus = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    serverStatusSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.db.s.topology, serverStatus, [this, options, callback]);
};

/**
 * Ping the MongoDB server and retrieve results
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const pingSchema = {
  session: { type: ClientSession }
};
Admin.prototype.ping = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    pingSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  const cmd = { ping: 1 };
  return executeOperation(this.s.db.s.topology, executeDbAdminCommand.bind(this.s.db), [
    this.s.db,
    cmd,
    options,
    callback
  ]);
};

/**
 * Add a user to the database.
 * @method
 * @param {string} username The username.
 * @param {string} password The password.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.fsync] Specify a file sync write concern.
 * @param {object} [options.customData] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {Array} [options.authenticationRestrictions] The authentication restrictions the server enforces on the created user. Specifies a list of IP addresses and CIDR ranges from which the user is allowed to connect to the server or from which the server can accept users. New in MongoDB 3.6.
 * @param {Array} [options.mechanisms] Specify the specific SCRAM mechanism or mechanisms for creating SCRAM user credentials. New in MongoDB 4.0
 * @param {string} [options.passwordDigestor] Indicates whether the server or the client digests the password. The default for MongoDB 4.0 is 'server'. The default before 4.0 is 'client'.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const addUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  fsync: { type: 'boolean' },
  customData: { type: 'object' },
  roles: { type: 'object' },
  authenticationRestrictions: { type: 'array' },
  mechanisms: { type: 'array' },
  passwordDigestor: { type: 'array' },
  session: { type: ClientSession }
};
Admin.prototype.addUser = function(username, password, options, callback) {
  const args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  options = args.length ? args.shift() : {};
  options = validate(
    addUserSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  // Get the options
  options = applyWriteConcern(options, { db: this.s.db });
  // Set the db name to admin
  options.dbName = 'admin';

  return executeOperation(this.s.db.s.topology, addUser, [
    this.s.db,
    username,
    password,
    options,
    callback
  ]);
};

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.fsync] Specify a file sync write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const removeUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  fsync: { type: 'boolean' },
  session: { type: ClientSession }
};
Admin.prototype.removeUser = function(username, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  options = args.length ? args.shift() : {};
  options = validate(
    removeUserSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );
  // Get the options
  options = applyWriteConcern(options, { db: this.s.db });
  // Set the db name
  options.dbName = 'admin';

  return executeOperation(this.s.db.s.topology, removeUser, [
    this.s.db,
    username,
    options,
    callback
  ]);
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
const validateCollectionSchema = {
  session: { type: ClientSession }
};
Admin.prototype.validateCollection = function(collectionName, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    validateCollectionSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.db.s.topology, validateCollection, [
    this,
    collectionName,
    options,
    callback
  ]);
};

/**
 * List the available databases
 *
 * @param {object} [options] Optional settings.
 * @param {object} [options.filter] A query predicate that determines which databases are listed.
 * @param {boolean} [options.nameOnly] Whether the command should return only db names, or names and size info.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
const listDatabasesSchema = {
  filter: { type: 'object' },
  nameOnly: { type: 'boolean' },
  session: { type: ClientSession }
};
Admin.prototype.listDatabases = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    listDatabasesSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  const cmd = { listDatabases: 1 };
  if (options.nameOnly) cmd.nameOnly = Number(cmd.nameOnly);
  return executeOperation(this.s.db.s.topology, executeDbAdminCommand.bind(this.s.db), [
    this.s.db,
    cmd,
    options,
    callback
  ]);
};

/**
 * Get ReplicaSet status
 *
 * @param {Object} [options] optional parameters for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Admin~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
const replSetGetStatusSchema = {
  session: { type: ClientSession }
};
Admin.prototype.replSetGetStatus = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    replSetGetStatusSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.db.s.topology, replSetGetStatus, [this, options, callback]);
};

module.exports = Admin;
