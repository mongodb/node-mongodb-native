'use strict';
const EventEmitter = require('events');
const ConnectionPool = require('../../cmap/connection_pool').ConnectionPool;
const CMAP_EVENT_NAMES = require('../../cmap/events').CMAP_EVENT_NAMES;
const MongoError = require('../error').MongoError;
const relayEvents = require('../utils').relayEvents;
const BSON = require('../connection/utils').retrieveBSON();
const Logger = require('../connection/logger');
const ServerDescription = require('./server_description').ServerDescription;
const compareTopologyVersion = require('./server_description').compareTopologyVersion;
const ReadPreference = require('../topologies/read_preference');
const Monitor = require('./monitor').Monitor;
const MongoNetworkError = require('../error').MongoNetworkError;
const MongoNetworkTimeoutError = require('../error').MongoNetworkTimeoutError;
const collationNotSupported = require('../utils').collationNotSupported;
const debugOptions = require('../connection/utils').debugOptions;
const isSDAMUnrecoverableError = require('../error').isSDAMUnrecoverableError;
const isRetryableWriteError = require('../error').isRetryableWriteError;
const isNodeShuttingDownError = require('../error').isNodeShuttingDownError;
const isNetworkErrorBeforeHandshake = require('../error').isNetworkErrorBeforeHandshake;
const maxWireVersion = require('../utils').maxWireVersion;
const makeStateMachine = require('../utils').makeStateMachine;
const extractCommand = require('../../command_utils').extractCommand;
const common = require('./common');
const ServerType = common.ServerType;
const isTransactionCommand = require('../transactions').isTransactionCommand;

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
  'bsonRegExp',
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

const kMonitor = Symbol('monitor');

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
      // the server state
      state: STATE_CLOSED,
      credentials: options.credentials,
      topology
    };

    // create the connection pool
    // NOTE: this used to happen in `connect`, we supported overriding pool options there
    const poolOptions = Object.assign(
      { host: this.description.host, port: this.description.port, bson: this.s.bson },
      options
    );

    this.s.pool = new ConnectionPool(poolOptions);
    relayEvents(
      this.s.pool,
      this,
      ['commandStarted', 'commandSucceeded', 'commandFailed'].concat(CMAP_EVENT_NAMES)
    );

    this.s.pool.on('clusterTimeReceived', clusterTime => {
      this.clusterTime = clusterTime;
    });

    // create the monitor
    this[kMonitor] = new Monitor(this, this.s.options);
    relayEvents(this[kMonitor], this, [
      'serverHeartbeatStarted',
      'serverHeartbeatSucceeded',
      'serverHeartbeatFailed',

      // legacy events
      'monitoring'
    ]);

    this[kMonitor].on('resetConnectionPool', () => {
      this.s.pool.clear();
    });

    this[kMonitor].on('resetServer', error => markServerUnknown(this, error));
    this[kMonitor].on('serverHeartbeatSucceeded', event => {
      this.emit(
        'descriptionReceived',
        new ServerDescription(this.description.address, event.reply, {
          roundTripTime: calculateRoundTripTime(this.description.roundTripTime, event.duration)
        })
      );

      if (this.s.state === STATE_CONNECTING) {
        stateTransition(this, STATE_CONNECTED);
        this.emit('connect', this);
      }
    });
  }

  get description() {
    return this.s.description;
  }

  get supportsRetryableWrites() {
    return supportsRetryableWrites(this);
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
  connect() {
    if (this.s.state !== STATE_CLOSED) {
      return;
    }

    stateTransition(this, STATE_CONNECTING);
    this[kMonitor].connect();
  }

  /**
   * Destroy the server connection
   *
   * @param {object} [options] Optional settings
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

    this[kMonitor].close();
    this.s.pool.close(options, err => {
      stateTransition(this, STATE_CLOSED);
      this.emit('closed');
      if (typeof callback === 'function') {
        callback(err);
      }
    });
  }

  /**
   * Immediately schedule monitoring of this server. If there already an attempt being made
   * this will be a no-op.
   */
  requestCheck() {
    this[kMonitor].requestCheck();
  }

  /**
   * Execute a command
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {object} [options] Optional settings
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.checkKeys=false] Specify if the bson parser should validate keys.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {Boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
   * @param {ClientSession} [options.session] Session to use for the operation
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
      return callback(error);
    }

    // Clone the options
    options = Object.assign({}, options, { wireProtocolCommand: false });

    // Debug log
    if (this.s.logger.isDebug()) {
      const extractedCommand = extractCommand(cmd);
      this.s.logger.debug(
        `executing command [${JSON.stringify({
          ns,
          cmd: extractedCommand.shouldRedact ? `${extractedCommand.name} details REDACTED` : cmd,
          options: debugOptions(DEBUG_FIELDS, options)
        })}] against ${this.name}`
      );
    }

    // error if collation not supported
    if (collationNotSupported(this, cmd)) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    this.s.pool.withConnection((err, conn, cb) => {
      if (err) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.command(ns, cmd, options, makeOperationHandler(this, conn, cmd, options, cb));
    }, callback);
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

    this.s.pool.withConnection((err, conn, cb) => {
      if (err) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.query(ns, cmd, cursorState, options, makeOperationHandler(this, conn, cmd, options, cb));
    }, callback);
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

    this.s.pool.withConnection((err, conn, cb) => {
      if (err) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.getMore(
        ns,
        cursorState,
        batchSize,
        options,
        makeOperationHandler(this, conn, null, options, cb)
      );
    }, callback);
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

    this.s.pool.withConnection((err, conn, cb) => {
      if (err) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.killCursors(ns, cursorState, makeOperationHandler(this, conn, null, undefined, cb));
    }, callback);
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
   * @param {ClientSession} [options.session] Session to use for the operation
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
   * @param {ClientSession} [options.session] Session to use for the operation
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
   * @param {ClientSession} [options.session] Session to use for the operation
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

function supportsRetryableWrites(server) {
  return (
    server.description.maxWireVersion >= 6 &&
    server.description.logicalSessionTimeoutMinutes &&
    server.description.type !== ServerType.Standalone
  );
}

function calculateRoundTripTime(oldRtt, duration) {
  if (oldRtt === -1) {
    return duration;
  }

  const alpha = 0.2;
  return alpha * duration + (1 - alpha) * oldRtt;
}

function basicReadValidations(server, options) {
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

  if (collationNotSupported(server, options)) {
    callback(new MongoError(`server ${server.name} does not support collation`));
    return;
  }
  const unacknowledgedWrite = options.writeConcern && options.writeConcern.w === 0;
  if (unacknowledgedWrite || maxWireVersion(server) < 5) {
    if ((op === 'update' || op === 'remove') && ops.find(o => o.hint)) {
      callback(new MongoError(`servers < 3.4 do not support hint on ${op}`));
      return;
    }
  }

  server.s.pool.withConnection((err, conn, cb) => {
    if (err) {
      markServerUnknown(server, err);
      return cb(err);
    }

    conn[op](ns, ops, options, makeOperationHandler(server, conn, ops, options, cb));
  }, callback);
}

function markServerUnknown(server, error) {
  if (error instanceof MongoNetworkError && !(error instanceof MongoNetworkTimeoutError)) {
    server[kMonitor].reset();
  }

  server.emit(
    'descriptionReceived',
    new ServerDescription(server.description.address, null, {
      error,
      topologyVersion:
        error && error.topologyVersion ? error.topologyVersion : server.description.topologyVersion
    })
  );
}

function connectionIsStale(pool, connection) {
  return connection.generation !== pool.generation;
}

function shouldHandleStateChangeError(server, err) {
  const etv = err.topologyVersion;
  const stv = server.description.topologyVersion;

  return compareTopologyVersion(stv, etv) < 0;
}

function inActiveTransaction(session, cmd) {
  return session && session.inTransaction() && !isTransactionCommand(cmd);
}

function makeOperationHandler(server, connection, cmd, options, callback) {
  const session = options && options.session;

  return function handleOperationResult(err, result) {
    if (err && !connectionIsStale(server.s.pool, connection)) {
      if (err instanceof MongoNetworkError) {
        if (session && !session.hasEnded) {
          session.serverSession.isDirty = true;
        }

        if (supportsRetryableWrites(server) && !inActiveTransaction(session, cmd)) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (!(err instanceof MongoNetworkTimeoutError) || isNetworkErrorBeforeHandshake(err)) {
          markServerUnknown(server, err);
          server.s.pool.clear();
        }
      } else {
        // if pre-4.4 server, then add error label if its a retryable write error
        if (
          maxWireVersion(server) < 9 &&
          isRetryableWriteError(err) &&
          !inActiveTransaction(session, cmd)
        ) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (isSDAMUnrecoverableError(err)) {
          if (shouldHandleStateChangeError(server, err)) {
            if (maxWireVersion(server) <= 7 || isNodeShuttingDownError(err)) {
              server.s.pool.clear();
            }

            markServerUnknown(server, err);
            process.nextTick(() => server.requestCheck());
          }
        }
      }
    }

    callback(err, result);
  };
}

module.exports = {
  Server
};
