'use strict';

const ChangeStream = require('./change_stream');
const Db = require('./db');
const EventEmitter = require('events').EventEmitter;
const executeOperation = require('./utils').executeOperation;
const inherits = require('util').inherits;
const MongoError = require('mongodb-core').MongoError;
const deprecate = require('util').deprecate;

// Operations
const connectOp = require('./operations/mongo_client_ops').connectOp;
const validOptions = require('./operations/mongo_client_ops').validOptions;
const closeOperation = require('./operations/mongo_client_ops').closeOperation;

/**
 * @fileOverview The **MongoClient** class is a class that allows for making Connections to MongoDB.
 *
 * @example
 * // Connect using a MongoClient instance
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * const mongoClient = new MongoClient(url);
 * mongoClient.connect(function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 *
 * @example
 * // Connect using the MongoClient.connect static method
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 */

/**
 * A string specifying the level of a ReadConcern
 * @typedef {'local'|'available'|'majority'|'linearizable'|'snapshot'} ReadConcernLevel
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html#read-concern-levels
 */

/**
 * Creates a new MongoClient instance
 * @class
 * @param {string} url The connection URI string
 * @param {object} [options] Optional settings
 * @param {number} [options.poolSize=5] The maximum size of the individual server pool
 * @param {boolean} [options.ssl=false] Enable SSL connection.
 * @param {boolean} [options.sslValidate=false] Validate mongod server certificate against Certificate Authority
 * @param {buffer} [options.sslCA=undefined] SSL Certificate store binary buffer
 * @param {buffer} [options.sslCert=undefined] SSL Certificate binary buffer
 * @param {buffer} [options.sslKey=undefined] SSL Key file binary buffer
 * @param {string} [options.sslPass=undefined] SSL Certificate pass phrase
 * @param {buffer} [options.sslCRL=undefined] SSL Certificate revocation list binary buffer
 * @param {boolean} [options.autoReconnect=true] Enable autoReconnect for single server instances
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=30000] The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @param {number} [options.connectTimeoutMS=30000] TCP Connection timeout setting
 * @param {number} [options.family] Version of IP stack. Can be 4, 6 or null (default).
 * If null, will attempt to connect with IPv6, and will fall back to IPv4 on failure
 * @param {number} [options.socketTimeoutMS=360000] TCP Socket timeout setting
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @param {boolean} [options.ha=true] Control if high availability monitoring runs for Replicaset or Mongos proxies
 * @param {number} [options.haInterval=10000] The High availability period for replicaset inquiry
 * @param {string} [options.replicaSet=undefined] The Replicaset set name
 * @param {number} [options.secondaryAcceptableLatencyMS=15] Cutoff latency point in MS for Replicaset member selection
 * @param {number} [options.acceptableLatencyMS=15] Cutoff latency point in MS for Mongos proxies selection
 * @param {boolean} [options.connectWithNoPrimary=false] Sets if the driver should connect even if no primary is available
 * @param {string} [options.authSource=undefined] Define the database to authenticate against
 * @param {(number|string)} [options.w] The write concern
 * @param {number} [options.wtimeout] The write concern timeout
 * @param {boolean} [options.j=false] Specify a journal write concern
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST)
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys
 * @param {object} [options.promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {object} [options.readConcern] Specify a read concern for the collection (only MongoDB 3.2 or higher supported)
 * @param {ReadConcernLevel} [options.readConcern.level='local'] Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
 * @param {number} [options.maxStalenessSeconds=undefined] The max staleness to secondary reads (values under 10 seconds cannot be guaranteed)
 * @param {string} [options.loggerLevel=undefined] The logging level (error/warn/info/debug)
 * @param {object} [options.logger=undefined] Custom logger object
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers
 * @param {boolean} [options.promoteLongs=true] Promotes long values to number if they fit inside the 53 bits resolution
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function
 * @param {object} [options.validateOptions=false] Validate MongoClient passed in options for correctness
 * @param {string} [options.appname=undefined] The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections
 * @param {string} [options.auth.user=undefined] The username for auth
 * @param {string} [options.auth.password=undefined] The password for auth
 * @param {string} [options.authMechanism=undefined] Mechanism for authentication: MDEFAULT, GSSAPI, PLAIN, MONGODB-X509, or SCRAM-SHA-1
 * @param {object} [options.compression] Type of compression to use: snappy or zlib
 * @param {boolean} [options.fsync=false] Specify a file sync write concern
 * @param {array} [options.readPreferenceTags] Read preference tags
 * @param {number} [options.numberOfRetries=5] The number of retries for a tailable cursor
 * @param {boolean} [options.auto_reconnect=true] Enable auto reconnecting for single server instances
 * @param {boolean} [options.monitorCommands=false] Enable command monitoring for this client
 * @param {number} [options.minSize] If present, the connection pool will be initialized with minSize connections, and will never dip below minSize connections
 * @param {boolean} [options.useNewUrlParser=false] Determines whether or not to use the new url parser. Enables the new, spec-compliant, url parser shipped in the core driver. This url parser fixes a number of problems with the original parser, and aims to outright replace that parser in the near future.
 * @param {boolean} [options.useUnifiedTopology] Enables the new unified topology layer
 * @param {MongoClient~connectCallback} [callback] The command result callback
 * @return {MongoClient} a MongoClient instance
 */
function MongoClient(url, options) {
  if (!(this instanceof MongoClient)) return new MongoClient(url, options);
  // Set up event emitter
  EventEmitter.call(this);

  // The internal state
  this.s = {
    url: url,
    options: options || {},
    promiseLibrary: null,
    dbCache: {},
    sessions: []
  };

  // Get the promiseLibrary
  const promiseLibrary = this.s.options.promiseLibrary || Promise;

  // Add the promise to the internal state
  this.s.promiseLibrary = promiseLibrary;
}

/**
 * @ignore
 */
inherits(MongoClient, EventEmitter);

/**
 * The callback format for results
 * @callback MongoClient~connectCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {MongoClient} client The connected client.
 */

/**
 * Connect to MongoDB using a url as documented at
 *
 *  docs.mongodb.org/manual/reference/connection-string/
 *
 * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
 *
 * @method
 * @param {MongoClient~connectCallback} [callback] The command result callback
 * @return {Promise<MongoClient>} returns Promise if no callback passed
 */
MongoClient.prototype.connect = function(callback) {
  // Validate options object
  const err = validOptions(this.s.options);

  if (typeof callback === 'string') {
    throw new TypeError('`connect` only accepts a callback');
  }

  return executeOperation(this, connectOp, [this, err, callback], {
    skipSessions: true
  });
};

MongoClient.prototype.logout = deprecate(function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  if (typeof callback === 'function') callback(null, true);
}, 'Multiple authentication is prohibited on a connected client, please only authenticate once per MongoClient');

/**
 * Close the db and its underlying connections
 * @method
 * @param {boolean} force Force close, emitting no events
 * @param {Db~noResultCallback} [callback] The result callback
 * @return {Promise} returns Promise if no callback passed
 */
MongoClient.prototype.close = function(force, callback) {
  if (typeof force === 'function') (callback = force), (force = false);
  return executeOperation(this, closeOperation, [this, force, callback], {
    skipSessions: true
  });
};

/**
 * Create a new Db instance sharing the current socket connections. Be aware that the new db instances are
 * related in a parent-child relationship to the original instance so that events are correctly emitted on child
 * db instances. Child db instances are cached so performing db('db1') twice will return the same instance.
 * You can control these behaviors with the options noListener and returnNonCachedInstance.
 *
 * @method
 * @param {string} [dbName] The name of the database we want to use. If not provided, use database name from connection string.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.noListener=false] Do not make the db an event listener to the original connection.
 * @param {boolean} [options.returnNonCachedInstance=false] Control if you want to return a cached instance or have a new one created
 * @return {Db}
 */
MongoClient.prototype.db = function(dbName, options) {
  options = options || {};

  // Default to db from connection string if not provided
  if (!dbName) {
    dbName = this.s.options.dbName;
  }

  // Copy the options and add out internal override of the not shared flag
  const finalOptions = Object.assign({}, this.s.options, options);

  // Do we have the db in the cache already
  if (this.s.dbCache[dbName] && finalOptions.returnNonCachedInstance !== true) {
    return this.s.dbCache[dbName];
  }

  // Add promiseLibrary
  finalOptions.promiseLibrary = this.s.promiseLibrary;

  // If no topology throw an error message
  if (!this.topology) {
    throw new MongoError('MongoClient must be connected before calling MongoClient.prototype.db');
  }

  // Return the db object
  const db = new Db(dbName, this.topology, finalOptions);

  // Add the db to the cache
  this.s.dbCache[dbName] = db;
  // Return the database
  return db;
};

/**
 * Check if MongoClient is connected
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.noListener=false] Do not make the db an event listener to the original connection.
 * @param {boolean} [options.returnNonCachedInstance=false] Control if you want to return a cached instance or have a new one created
 * @return {boolean}
 */
MongoClient.prototype.isConnected = function(options) {
  options = options || {};

  if (!this.topology) return false;
  return this.topology.isConnected(options);
};

/**
 * Connect to MongoDB using a url as documented at
 *
 *  docs.mongodb.org/manual/reference/connection-string/
 *
 * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
 *
 * @method
 * @static
 * @param {string} url The connection URI string
 * @param {object} [options] Optional settings
 * @param {number} [options.poolSize=5] The maximum size of the individual server pool
 * @param {boolean} [options.ssl=false] Enable SSL connection.
 * @param {boolean} [options.sslValidate=false] Validate mongod server certificate against Certificate Authority
 * @param {buffer} [options.sslCA=undefined] SSL Certificate store binary buffer
 * @param {buffer} [options.sslCert=undefined] SSL Certificate binary buffer
 * @param {buffer} [options.sslKey=undefined] SSL Key file binary buffer
 * @param {string} [options.sslPass=undefined] SSL Certificate pass phrase
 * @param {buffer} [options.sslCRL=undefined] SSL Certificate revocation list binary buffer
 * @param {boolean} [options.autoReconnect=true] Enable autoReconnect for single server instances
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {boolean} [options.keepAliveInitialDelay=30000] The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @param {number} [options.connectTimeoutMS=30000] TCP Connection timeout setting
 * @param {number} [options.family] Version of IP stack. Can be 4, 6 or null (default).
 * If null, will attempt to connect with IPv6, and will fall back to IPv4 on failure
 * @param {number} [options.socketTimeoutMS=360000] TCP Socket timeout setting
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @param {boolean} [options.ha=true] Control if high availability monitoring runs for Replicaset or Mongos proxies
 * @param {number} [options.haInterval=10000] The High availability period for replicaset inquiry
 * @param {string} [options.replicaSet=undefined] The Replicaset set name
 * @param {number} [options.secondaryAcceptableLatencyMS=15] Cutoff latency point in MS for Replicaset member selection
 * @param {number} [options.acceptableLatencyMS=15] Cutoff latency point in MS for Mongos proxies selection
 * @param {boolean} [options.connectWithNoPrimary=false] Sets if the driver should connect even if no primary is available
 * @param {string} [options.authSource=undefined] Define the database to authenticate against
 * @param {(number|string)} [options.w] The write concern
 * @param {number} [options.wtimeout] The write concern timeout
 * @param {boolean} [options.j=false] Specify a journal write concern
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST)
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys
 * @param {object} [options.promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {object} [options.readConcern] Specify a read concern for the collection (only MongoDB 3.2 or higher supported)
 * @param {ReadConcernLevel} [options.readConcern.level='local'] Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
 * @param {number} [options.maxStalenessSeconds=undefined] The max staleness to secondary reads (values under 10 seconds cannot be guaranteed)
 * @param {string} [options.loggerLevel=undefined] The logging level (error/warn/info/debug)
 * @param {object} [options.logger=undefined] Custom logger object
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers
 * @param {boolean} [options.promoteLongs=true] Promotes long values to number if they fit inside the 53 bits resolution
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function
 * @param {object} [options.validateOptions=false] Validate MongoClient passed in options for correctness
 * @param {string} [options.appname=undefined] The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections
 * @param {string} [options.auth.user=undefined] The username for auth
 * @param {string} [options.auth.password=undefined] The password for auth
 * @param {string} [options.authMechanism=undefined] Mechanism for authentication: MDEFAULT, GSSAPI, PLAIN, MONGODB-X509, or SCRAM-SHA-1
 * @param {object} [options.compression] Type of compression to use: snappy or zlib
 * @param {boolean} [options.fsync=false] Specify a file sync write concern
 * @param {array} [options.readPreferenceTags] Read preference tags
 * @param {number} [options.numberOfRetries=5] The number of retries for a tailable cursor
 * @param {boolean} [options.auto_reconnect=true] Enable auto reconnecting for single server instances
 * @param {number} [options.minSize] If present, the connection pool will be initialized with minSize connections, and will never dip below minSize connections
 * @param {MongoClient~connectCallback} [callback] The command result callback
 * @return {Promise<MongoClient>} returns Promise if no callback passed
 */
MongoClient.connect = function(url, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() : null;
  options = options || {};

  // Create client
  const mongoClient = new MongoClient(url, options);
  // Execute the connect method
  return mongoClient.connect(callback);
};

/**
 * Starts a new session on the server
 *
 * @param {SessionOptions} [options] optional settings for a driver session
 * @return {ClientSession} the newly established session
 */
MongoClient.prototype.startSession = function(options) {
  options = Object.assign({ explicit: true }, options);
  if (!this.topology) {
    throw new MongoError('Must connect to a server before calling this method');
  }

  if (!this.topology.hasSessionSupport()) {
    throw new MongoError('Current topology does not support sessions');
  }

  return this.topology.startSession(options, this.s.options);
};

/**
 * Runs a given operation with an implicitly created session. The lifetime of the session
 * will be handled without the need for user interaction.
 *
 * NOTE: presently the operation MUST return a Promise (either explicit or implicity as an async function)
 *
 * @param {Object} [options] Optional settings to be appled to implicitly created session
 * @param {Function} operation An operation to execute with an implicitly created session. The signature of this MUST be `(session) => {}`
 * @return {Promise}
 */
MongoClient.prototype.withSession = function(options, operation) {
  if (typeof options === 'function') (operation = options), (options = undefined);
  const session = this.startSession(options);

  let cleanupHandler = (err, result, opts) => {
    // prevent multiple calls to cleanupHandler
    cleanupHandler = () => {
      throw new ReferenceError('cleanupHandler was called too many times');
    };

    opts = Object.assign({ throw: true }, opts);
    session.endSession();

    if (err) {
      if (opts.throw) throw err;
      return Promise.reject(err);
    }
  };

  try {
    const result = operation(session);
    return Promise.resolve(result)
      .then(result => cleanupHandler(null, result))
      .catch(err => cleanupHandler(err, null, { throw: true }));
  } catch (err) {
    return cleanupHandler(err, null, { throw: false });
  }
};
/**
 * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this cluster. Will ignore all changes to system collections, as well as the local, admin,
 * and config databases.
 * @method
 * @since 3.1.0
 * @param {Array} [pipeline] An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
 * @param {object} [options] Optional settings
 * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {object} [options.resumeAfter] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {number} [options.batchSize] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference] The read preference. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @param {Timestamp} [options.startAtClusterTime] receive change events that occur after the specified timestamp
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {ChangeStream} a ChangeStream instance.
 */
MongoClient.prototype.watch = function(pipeline, options) {
  pipeline = pipeline || [];
  options = options || {};

  // Allow optionally not specifying a pipeline
  if (!Array.isArray(pipeline)) {
    options = pipeline;
    pipeline = [];
  }

  return new ChangeStream(this, pipeline, options);
};

/**
 * Return the mongo client logger
 * @method
 * @return {Logger} return the mongo client logger
 * @ignore
 */
MongoClient.prototype.getLogger = function() {
  return this.s.options.logger;
};

module.exports = MongoClient;
