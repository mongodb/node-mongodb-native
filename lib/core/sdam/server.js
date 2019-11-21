'use strict';
const EventEmitter = require('events');
const MongoError = require('../error').MongoError;
const Pool = require('../connection/pool');
const relayEvents = require('../utils').relayEvents;
const wireProtocol = require('../wireprotocol');
const BSON = require('../connection/utils').retrieveBSON();
const createClientInfo = require('../topologies/shared').createClientInfo;
const Logger = require('../connection/logger');
const ServerDescription = require('./server_description').ServerDescription;
const ReadPreference = require('../topologies/read_preference');
const monitorServer = require('./monitoring').monitorServer;
const MongoParseError = require('../error').MongoParseError;
const MongoNetworkError = require('../error').MongoNetworkError;
const collationNotSupported = require('../utils').collationNotSupported;
const debugOptions = require('../connection/utils').debugOptions;
const isSDAMUnrecoverableError = require('../error').isSDAMUnrecoverableError;
const makeStateMachine = require('../utils').makeStateMachine;
const common = require('./common');

// Used for filtering out fields for logging
const DEBUG_FIELDS = [
  'reconnect',
  'reconnectTries',
  'reconnectInterval',
  'emitError',
  'cursorFactory',
  'host',
  'port',
  'size',
  'keepAlive',
  'keepAliveInitialDelay',
  'noDelay',
  'connectionTimeout',
  'checkServerIdentity',
  'socketTimeout',
  'ssl',
  'ca',
  'crl',
  'cert',
  'key',
  'rejectUnauthorized',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'servername'
];

const STATE_CLOSING = common.STATE_CLOSING;
const STATE_CLOSED = common.STATE_CLOSED;
const STATE_CONNECTING = common.STATE_CONNECTING;
const STATE_CONNECTED = common.STATE_CONNECTED;
const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

/**
 *
 * @fires Server#serverHeartbeatStarted
 * @fires Server#serverHeartbeatSucceeded
 * @fires Server#serverHeartbeatFailed
 */
class Server extends EventEmitter {
  /**
   * Create a server
   *
   * @param {ServerDescription} description
   * @param {Object} options
   */
  constructor(description, options, topology) {
    super();

    this.s = {
      // the server description
      description,
      // a saved copy of the incoming options
      options,
      // the server logger
      logger: Logger('Server', options),
      // the bson parser
      bson:
        options.bson ||
        new BSON([
          BSON.Binary,
          BSON.Code,
          BSON.DBRef,
          BSON.Decimal128,
          BSON.Double,
          BSON.Int32,
          BSON.Long,
          BSON.Map,
          BSON.MaxKey,
          BSON.MinKey,
          BSON.ObjectId,
          BSON.BSONRegExp,
          BSON.Symbol,
          BSON.Timestamp
        ]),
      // client metadata for the initial handshake
      clientInfo: createClientInfo(options),
      // state variable to determine if there is an active server check in progress
      monitoring: false,
      // the implementation of the monitoring method
      monitorFunction: options.monitorFunction || monitorServer,
      // the connection pool
      pool: null,
      // the server state
      state: STATE_CLOSED,
      credentials: options.credentials,
      topology
    };
  }

  get description() {
    return this.s.description;
  }

  get name() {
    return this.s.description.address;
  }

  get autoEncrypter() {
    if (this.s.options && this.s.options.autoEncrypter) {
      return this.s.options.autoEncrypter;
    }
    return null;
  }

  /**
   * Initiate server connect
   */
  connect(options) {
    options = options || {};

    // do not allow connect to be called on anything that's not disconnected
    if (this.s.pool && !this.s.pool.isDisconnected() && !this.s.pool.isDestroyed()) {
      throw new MongoError(`Server instance in invalid state ${this.s.pool.state}`);
    }

    // create a pool
    const addressParts = this.description.address.split(':');
    const poolOptions = Object.assign(
      { host: addressParts[0], port: parseInt(addressParts[1], 10) },
      this.s.options,
      options,
      { bson: this.s.bson }
    );

    // NOTE: reconnect is explicitly false because of the server selection loop
    poolOptions.reconnect = false;
    poolOptions.legacyCompatMode = false;

    this.s.pool = new Pool(this, poolOptions);

    // setup listeners
    this.s.pool.on('parseError', parseErrorEventHandler(this));

    this.s.pool.on('drain', err => {
      this.emit('error', err);
    });

    // it is unclear whether consumers should even know about these events
    // this.s.pool.on('timeout', timeoutEventHandler(this));
    // this.s.pool.on('reconnect', reconnectEventHandler(this));
    // this.s.pool.on('reconnectFailed', errorEventHandler(this));

    // relay all command monitoring events
    relayEvents(this.s.pool, this, ['commandStarted', 'commandSucceeded', 'commandFailed']);

    stateTransition(this, STATE_CONNECTING);

    this.s.pool.connect(connectEventHandler(this));
  }

  /**
   * Destroy the server connection
   *
   * @param {Boolean} [options.force=false] Force destroy the pool
   */
  destroy(options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, { force: false }, options);
    if (this.s.state === STATE_CLOSED) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CLOSING);

    const done = err => {
      stateTransition(this, STATE_CLOSED);
      this.emit('closed');
      if (typeof callback === 'function') {
        callback(err, null);
      }
    };

    if (!this.s.pool) {
      return done();
    }

    ['close', 'error', 'timeout', 'parseError', 'connect'].forEach(event => {
      this.s.pool.removeAllListeners(event);
    });

    if (this.s.monitorId) {
      clearTimeout(this.s.monitorId);
    }

    this.s.pool.destroy(options.force, done);
  }

  /**
   * Immediately schedule monitoring of this server. If there already an attempt being made
   * this will be a no-op.
   */
  monitor(options) {
    options = options || {};
    if (this.s.state !== STATE_CONNECTED || this.s.monitoring) return;
    if (this.s.monitorId) clearTimeout(this.s.monitorId);
    this.s.monitorFunction(this, options);
  }

  /**
   * Execute a command
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.checkKeys=false] Specify if the bson parser should validate keys.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {Boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  command(ns, cmd, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
      return;
    }

    const error = basicReadValidations(this, options);
    if (error) {
      return callback(error, null);
    }

    // Clone the options
    options = Object.assign({}, options, { wireProtocolCommand: false });

    // Debug log
    if (this.s.logger.isDebug()) {
      this.s.logger.debug(
        `executing command [${JSON.stringify({
          ns,
          cmd,
          options: debugOptions(DEBUG_FIELDS, options)
        })}] against ${this.name}`
      );
    }

    // error if collation not supported
    if (collationNotSupported(this, cmd)) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    wireProtocol.command(this, ns, cmd, options, (err, result) => {
      if (err) {
        if (options.session && err instanceof MongoNetworkError) {
          options.session.serverSession.isDirty = true;
        }

        if (isSDAMUnrecoverableError(err, this)) {
          this.emit('error', err);
        }
      }

      callback(err, result);
    });
  }

  /**
   * Execute a query against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command document for the query
   * @param {object} options Optional settings
   * @param {function} callback
   */
  query(ns, cmd, cursorState, options, callback) {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
      return;
    }

    wireProtocol.query(this, ns, cmd, cursorState, options, (err, result) => {
      if (err) {
        if (options.session && err instanceof MongoNetworkError) {
          options.session.serverSession.isDirty = true;
        }

        if (isSDAMUnrecoverableError(err, this)) {
          this.emit('error', err);
        }
      }

      callback(err, result);
    });
  }

  /**
   * Execute a `getMore` against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cursorState State data associated with the cursor calling this method
   * @param {object} options Optional settings
   * @param {function} callback
   */
  getMore(ns, cursorState, batchSize, options, callback) {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
      return;
    }

    wireProtocol.getMore(this, ns, cursorState, batchSize, options, (err, result) => {
      if (err) {
        if (options.session && err instanceof MongoNetworkError) {
          options.session.serverSession.isDirty = true;
        }

        if (isSDAMUnrecoverableError(err, this)) {
          this.emit('error', err);
        }
      }

      callback(err, result);
    });
  }

  /**
   * Execute a `killCursors` command against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cursorState State data associated with the cursor calling this method
   * @param {function} callback
   */
  killCursors(ns, cursorState, callback) {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      if (typeof callback === 'function') {
        callback(new MongoError('server is closed'));
      }

      return;
    }

    wireProtocol.killCursors(this, ns, cursorState, (err, result) => {
      if (err && isSDAMUnrecoverableError(err, this)) {
        this.emit('error', err);
      }

      if (typeof callback === 'function') {
        callback(err, result);
      }
    });
  }

  /**
   * Insert one or more documents
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of documents to insert
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  insert(ns, ops, options, callback) {
    executeWriteOperation({ server: this, op: 'insert', ns, ops }, options, callback);
  }

  /**
   * Perform one or more update operations
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of updates
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  update(ns, ops, options, callback) {
    executeWriteOperation({ server: this, op: 'update', ns, ops }, options, callback);
  }

  /**
   * Perform one or more remove operations
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of removes
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  remove(ns, ops, options, callback) {
    executeWriteOperation({ server: this, op: 'remove', ns, ops }, options, callback);
  }
}

Object.defineProperty(Server.prototype, 'clusterTime', {
  get: function() {
    return this.s.topology.clusterTime;
  },
  set: function(clusterTime) {
    this.s.topology.clusterTime = clusterTime;
  }
});

function basicWriteValidations(server) {
  if (!server.s.pool) {
    return new MongoError('server instance is not connected');
  }

  if (server.s.pool.isDestroyed()) {
    return new MongoError('server instance pool was destroyed');
  }

  return null;
}

function basicReadValidations(server, options) {
  const error = basicWriteValidations(server, options);
  if (error) {
    return error;
  }

  if (options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    return new MongoError('readPreference must be an instance of ReadPreference');
  }
}

function executeWriteOperation(args, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // TODO: once we drop Node 4, use destructuring either here or in arguments.
  const server = args.server;
  const op = args.op;
  const ns = args.ns;
  const ops = Array.isArray(args.ops) ? args.ops : [args.ops];

  if (server.s.state === STATE_CLOSING || server.s.state === STATE_CLOSED) {
    callback(new MongoError('server is closed'));
    return;
  }

  const error = basicWriteValidations(server, options);
  if (error) {
    callback(error, null);
    return;
  }

  if (collationNotSupported(server, options)) {
    callback(new MongoError(`server ${server.name} does not support collation`));
    return;
  }

  return wireProtocol[op](server, ns, ops, options, (err, result) => {
    if (err) {
      if (options.session && err instanceof MongoNetworkError) {
        options.session.serverSession.isDirty = true;
      }

      if (isSDAMUnrecoverableError(err, server)) {
        server.emit('error', err);
      }
    }

    callback(err, result);
  });
}

function connectEventHandler(server) {
  return function(err, conn) {
    if (server.s.state === STATE_CLOSING || server.s.state === STATE_CLOSED) {
      return;
    }

    if (err) {
      server.emit('error', new MongoNetworkError(err));

      stateTransition(server, STATE_CLOSED);
      server.emit('close');
      return;
    }

    const ismaster = conn.ismaster;
    server.s.lastIsMasterMS = conn.lastIsMasterMS;
    if (conn.agreedCompressor) {
      server.s.pool.options.agreedCompressor = conn.agreedCompressor;
    }

    if (conn.zlibCompressionLevel) {
      server.s.pool.options.zlibCompressionLevel = conn.zlibCompressionLevel;
    }

    if (conn.ismaster.$clusterTime) {
      const $clusterTime = conn.ismaster.$clusterTime;
      server.s.sclusterTime = $clusterTime;
    }

    // log the connection event if requested
    if (server.s.logger.isInfo()) {
      server.s.logger.info(
        `server ${server.name} connected with ismaster [${JSON.stringify(ismaster)}]`
      );
    }

    // we are connected and handshaked (guaranteed by the pool)
    stateTransition(server, STATE_CONNECTED);
    server.emit('connect', server);

    // emit an event indicating that our description has changed
    server.emit('descriptionReceived', new ServerDescription(server.description.address, ismaster));
  };
}

function parseErrorEventHandler(server) {
  return function(err) {
    stateTransition(this, STATE_CLOSED);
    server.emit('error', new MongoParseError(err));
  };
}

module.exports = {
  Server
};
