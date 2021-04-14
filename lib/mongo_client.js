'use strict';

const ChangeStream = require('./change_stream');
const Db = require('./db');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const MongoError = require('./core').MongoError;
const deprecate = require('util').deprecate;
const WriteConcern = require('./write_concern');
const MongoDBNamespace = require('./utils').MongoDBNamespace;
const ReadPreference = require('./core/topologies/read_preference');
const maybePromise = require('./utils').maybePromise;
const NativeTopology = require('./topologies/native_topology');
const connect = require('./operations/connect').connect;
const validOptions = require('./operations/connect').validOptions;

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
 * Configuration options for drivers wrapping the node driver.
 *
 * @typedef {Object} DriverInfoOptions
 * @property {string} [name] The name of the driver
 * @property {string} [version] The version of the driver
 * @property {string} [platform] Optional platform information
 */

/**
 * Configuration options for drivers wrapping the node driver.
 *
 * @typedef {Object} DriverInfoOptions
 * @property {string} [name] The name of the driver
 * @property {string} [version] The version of the driver
 * @property {string} [platform] Optional platform information
 */

/**
 * @public
 * @typedef AutoEncryptionOptions
 * @property {MongoClient} [keyVaultClient] A `MongoClient` used to fetch keys from a key vault
 * @property {string} [keyVaultNamespace] The namespace where keys are stored in the key vault
 * @property {object} [kmsProviders] Configuration options that are used by specific KMS providers during key generation, encryption, and decryption.
 * @property {object} [schemaMap] A map of namespaces to a local JSON schema for encryption
 *
 * > **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
 * > It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
 * > Schemas supplied in the schemaMap only apply to configuring automatic encryption for client side encryption.
 * > Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
 *
 * @property {object} [options] An optional hook to catch logging messages from the underlying encryption engine
 * @property {object} [extraOptions]
 * @property {boolean} [bypassAutoEncryption]
 */

/**
 * @typedef {object} MongoClientOptions
 * @property {number} [poolSize] (**default**: 5) The maximum size of the individual server pool
 * @property {boolean} [ssl] (**default**: false) Enable SSL connection. *deprecated* use `tls` variants
 * @property {boolean} [sslValidate] (**default**: false) Validate mongod server certificate against Certificate Authority
 * @property {buffer} [sslCA] (**default**: undefined) SSL Certificate store binary buffer *deprecated* use `tls` variants
 * @property {buffer} [sslCert] (**default**: undefined) SSL Certificate binary buffer *deprecated* use `tls` variants
 * @property {buffer} [sslKey] (**default**: undefined) SSL Key file binary buffer *deprecated* use `tls` variants
 * @property {string} [sslPass] (**default**: undefined) SSL Certificate pass phrase *deprecated* use `tls` variants
 * @property {buffer} [sslCRL] (**default**: undefined) SSL Certificate revocation list binary buffer *deprecated* use `tls` variants
 * @property {boolean|function} [checkServerIdentity] (**default**: true) Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function. *deprecated* use `tls` variants
 * @property {boolean} [tls] (**default**: false) Enable TLS connections
 * @property {boolean} [tlsInsecure] (**default**: false) Relax TLS constraints, disabling validation
 * @property {string} [tlsCAFile] A path to file with either a single or bundle of certificate authorities to be considered trusted when making a TLS connection
 * @property {string} [tlsCertificateKeyFile] A path to the client certificate file or the client private key file; in the case that they both are needed, the files should be concatenated
 * @property {string} [tlsCertificateKeyFilePassword] The password to decrypt the client private key to be used for TLS connections
 * @property {boolean} [tlsAllowInvalidCertificates] Specifies whether or not the driver should error when the server’s TLS certificate is invalid
 * @property {boolean} [tlsAllowInvalidHostnames] Specifies whether or not the driver should error when there is a mismatch between the server’s hostname and the hostname specified by the TLS certificate
 * @property {boolean} [autoReconnect] (**default**: true) Enable autoReconnect for single server instances
 * @property {boolean} [noDelay] (**default**: true) TCP Connection no delay
 * @property {boolean} [keepAlive] (**default**: true) TCP Connection keep alive enabled
 * @property {number} [keepAliveInitialDelay] (**default**: 120000) The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @property {number} [connectTimeoutMS] (**default**: 10000) How long to wait for a connection to be established before timing out
 * @property {number} [socketTimeoutMS] (**default**: 0) How long a send or receive on a socket can take before timing out
 * @property {number} [family] Version of IP stack. Can be 4, 6 or null (default). If null, will attempt to connect with IPv6, and will fall back to IPv4 on failure
 * @property {number} [reconnectTries] (**default**: 30) Server attempt to reconnect #times
 * @property {number} [reconnectInterval] (**default**: 1000) Server will wait # milliseconds between retries
 * @property {boolean} [ha] (**default**: true) Control if high availability monitoring runs for Replicaset or Mongos proxies
 * @property {number} [haInterval] (**default**: 10000) The High availability period for replicaset inquiry
 * @property {string} [replicaSet] (**default**: undefined) The Replicaset set name
 * @property {number} [secondaryAcceptableLatencyMS] (**default**: 15) Cutoff latency point in MS for Replicaset member selection
 * @property {number} [acceptableLatencyMS] (**default**: 15) Cutoff latency point in MS for Mongos proxies selection
 * @property {boolean} [connectWithNoPrimary] (**default**: false) Sets if the driver should connect even if no primary is available
 * @property {string} [authSource] (**default**: undefined) Define the database to authenticate against
 * @property {(number|string)} [w] **Deprecated** The write concern. Use writeConcern instead.
 * @property {number} [wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @property {boolean} [j] (**default**: false) **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @property {boolean} [fsync] (**default**: false) **Deprecated** Specify a file sync write concern. Use writeConcern instead.
 * @property {object|WriteConcern} [writeConcern] Specify write concern settings.
 * @property {boolean} [forceServerObjectId] (**default**: false) Force server to assign _id values instead of driver
 * @property {boolean} [serializeFunctions] (**default**: false) Serialize functions on any object
 * @property {Boolean} [ignoreUndefined] (**default**: false) Specify if the BSON serializer should ignore undefined fields
 * @property {boolean} [raw] (**default**: false) Return document results as raw BSON buffers
 * @property {number} [bufferMaxEntries] (**default**: -1) Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited
 * @property {(ReadPreference|string)} [readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST)
 * @property {object} [pkFactory] A primary key factory object for generation of custom _id keys
 * @property {object} [promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @property {object} [readConcern] Specify a read concern for the collection (only MongoDB 3.2 or higher supported)
 * @property {ReadConcernLevel} [readConcern.level] (**default**: {Level: 'local'}) Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
 * @property {number} [maxStalenessSeconds] (**default**: undefined) The max staleness to secondary reads (values under 10 seconds cannot be guaranteed)
 * @property {string} [loggerLevel] (**default**: undefined) The logging level (error/warn/info/debug)
 * @property {object} [logger] (**default**: undefined) Custom logger object
 * @property {boolean} [promoteValues] (**default**: true) Promotes BSON values to native types where possible, set to false to only receive wrapper types
 * @property {boolean} [promoteBuffers] (**default**: false) Promotes Binary BSON values to native Node Buffers
 * @property {boolean} [promoteLongs] (**default**: true) Promotes long values to number if they fit inside the 53 bits resolution
 * @property {boolean} [domainsEnabled] (**default**: false) Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit
 * @property {object} [validateOptions] (**default**: false) Validate MongoClient passed in options for correctness
 * @property {string} [appname] (**default**: undefined) The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections
 * @property {string} [options.auth.user] (**default**: undefined) The username for auth
 * @property {string} [options.auth.password] (**default**: undefined) The password for auth
 * @property {string} [authMechanism] An authentication mechanism to use for connection authentication, see the {@link https://docs.mongodb.com/manual/reference/connection-string/#urioption.authMechanism|authMechanism} reference for supported options.
 * @property {object} [compression] Type of compression to use: snappy or zlib
 * @property {array} [readPreferenceTags] Read preference tags
 * @property {number} [numberOfRetries] (**default**: 5) The number of retries for a tailable cursor
 * @property {boolean} [auto_reconnect] (**default**: true) Enable auto reconnecting for single server instances
 * @property {boolean} [monitorCommands] (**default**: false) Enable command monitoring for this client
 * @property {number} [minSize] If present, the connection pool will be initialized with minSize connections, and will never dip below minSize connections
 * @property {boolean} [useNewUrlParser] (**default**: true) Determines whether or not to use the new url parser. Enables the new, spec-compliant, url parser shipped in the core driver. This url parser fixes a number of problems with the original parser, and aims to outright replace that parser in the near future. Defaults to true, and must be explicitly set to false to use the legacy url parser.
 * @property {boolean} [useUnifiedTopology] Enables the new unified topology layer
 * @property {number} [localThresholdMS] (**default**: 15) **Only applies to the unified topology** The size of the latency window for selecting among multiple suitable servers
 * @property {number} [serverSelectionTimeoutMS] (**default**: 30000) **Only applies to the unified topology** How long to block for server selection before throwing an error
 * @property {number} [heartbeatFrequencyMS] (**default**: 10000) **Only applies to the unified topology** The frequency with which topology updates are scheduled
 * @property {number} [maxPoolSize] (**default**: 10) **Only applies to the unified topology** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections.
 * @property {number} [minPoolSize] (**default**: 0) **Only applies to the unified topology** The minimum number of connections that MUST exist at any moment in a single connection pool.
 * @property {number} [maxIdleTimeMS] **Only applies to the unified topology** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. The default is infinity.
 * @property {number} [waitQueueTimeoutMS] (**default**: 0) **Only applies to the unified topology** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit.
 * @property {AutoEncryptionOptions} [autoEncryption] Optionally enable client side auto encryption.
 *
 * > Automatic encryption is an enterprise only feature that only applies to operations on a collection. Automatic encryption is not supported for operations on a database or view, and operations that are not bypassed will result in error
 * > (see [libmongocrypt: Auto Encryption Allow-List](https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/client-side-encryption.rst#libmongocrypt-auto-encryption-allow-list)). To bypass automatic encryption for all operations, set bypassAutoEncryption=true in AutoEncryptionOpts.
 * >
 * > Automatic encryption requires the authenticated user to have the [listCollections privilege action](https://docs.mongodb.com/manual/reference/command/listCollections/#dbcmd.listCollections).
 * >
 * > If a MongoClient with a limited connection pool size (i.e a non-zero maxPoolSize) is configured with AutoEncryptionOptions, a separate internal MongoClient is created if any of the following are true:
 * > - AutoEncryptionOptions.keyVaultClient is not passed.
 * > - AutoEncryptionOptions.bypassAutomaticEncryption is false.
 * > If an internal MongoClient is created, it is configured with the same options as the parent MongoClient except minPoolSize is set to 0 and AutoEncryptionOptions is omitted.
 *
 * @property {DriverInfoOptions} [driverInfo] Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver
 * @property {boolean} [directConnection] (**default**: false) Enable directConnection
 * @property {function} [callback] The command result callback
 */

/**
 * Creates a new MongoClient instance
 * @constructor
 * @extends {EventEmitter}
 * @param {string} url The connection URI string
 * @param {MongoClientOptions} [options] Optional settings
 */
function MongoClient(url, options) {
  if (!(this instanceof MongoClient)) return new MongoClient(url, options);
  // Set up event emitter
  EventEmitter.call(this);

  if (options && options.autoEncryption) require('./encrypter'); // Does CSFLE lib check

  // The internal state
  this.s = {
    url: url,
    options: options || {},
    promiseLibrary: (options && options.promiseLibrary) || Promise,
    dbCache: new Map(),
    sessions: new Set(),
    writeConcern: WriteConcern.fromOptions(options),
    readPreference: ReadPreference.fromOptions(options) || ReadPreference.primary,
    namespace: new MongoDBNamespace('admin')
  };
}

/**
 * @ignore
 */
inherits(MongoClient, EventEmitter);

Object.defineProperty(MongoClient.prototype, 'writeConcern', {
  enumerable: true,
  get: function() {
    return this.s.writeConcern;
  }
});

Object.defineProperty(MongoClient.prototype, 'readPreference', {
  enumerable: true,
  get: function() {
    return this.s.readPreference;
  }
});

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
  if (typeof callback === 'string') {
    throw new TypeError('`connect` only accepts a callback');
  }

  const client = this;
  return maybePromise(this, callback, cb => {
    const err = validOptions(client.s.options);
    if (err) return cb(err);

    connect(client, client.s.url, client.s.options, err => {
      if (err) return cb(err);
      cb(null, client);
    });
  });
};

MongoClient.prototype.logout = deprecate(function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  if (typeof callback === 'function') callback(null, true);
}, 'Multiple authentication is prohibited on a connected client, please only authenticate once per MongoClient');

/**
 * Close the db and its underlying connections
 * @method
 * @param {boolean} [force=false] Force close, emitting no events
 * @param {Db~noResultCallback} [callback] The result callback
 * @return {Promise} returns Promise if no callback passed
 */
MongoClient.prototype.close = function(force, callback) {
  if (typeof force === 'function') {
    callback = force;
    force = false;
  }

  const client = this;
  return maybePromise(this, callback, cb => {
    const completeClose = err => {
      client.emit('close', client);

      if (!(client.topology instanceof NativeTopology)) {
        for (const item of client.s.dbCache) {
          item[1].emit('close', client);
        }
      }

      client.removeAllListeners('close');
      cb(err);
    };

    if (client.topology == null) {
      completeClose();
      return;
    }

    client.topology.close(force, err => {
      const encrypter = client.topology.s.options.encrypter;
      if (encrypter) {
        return encrypter.close(client, force, err2 => {
          completeClose(err || err2);
        });
      }
      completeClose(err);
    });
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
  if (this.s.dbCache.has(dbName) && finalOptions.returnNonCachedInstance !== true) {
    return this.s.dbCache.get(dbName);
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
  this.s.dbCache.set(dbName, db);
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
 * @param {MongoClientOptions} [options] Optional settings
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
 * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference] The read preference. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @param {Timestamp} [options.startAtOperationTime] receive change events that occur after the specified timestamp
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
