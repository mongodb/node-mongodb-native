'use strict';
const EventEmitter = require('events');
const Logger = require('../logger');
const ReadPreference = require('../read_preference');
const { ConnectionPool } = require('../cmap/connection_pool');
const { CMAP_EVENT_NAMES } = require('../cmap/events');
const { ServerDescription } = require('./server_description');
const { Monitor } = require('./monitor');
const {
  relayEvents,
  collationNotSupported,
  debugOptions,
  makeStateMachine,
  maxWireVersion
} = require('../utils');
const {
  ServerType,
  STATE_CLOSED,
  STATE_CLOSING,
  STATE_CONNECTING,
  STATE_CONNECTED
} = require('./common');
const {
  MongoError,
  MongoNetworkError,
  isSDAMUnrecoverableError,
  isNetworkTimeoutError,
  isRetryableWriteError,
  isNodeShuttingDownError
} = require('../error');

// type imports
/** @typedef {InstanceType<import('../sessions')['ClientSession']>} ClientSession */

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

const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

const kMonitor = Symbol('monitor');

/**
 * @fires Server#serverHeartbeatStarted
 * @fires Server#serverHeartbeatSucceeded
 * @fires Server#serverHeartbeatFailed
 */
class Server extends EventEmitter {
  /**
   * Create a server
   *
   * @param {ServerDescription} description
   * @param {object} options
   * @param {any} topology
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
      // the server state
      state: STATE_CLOSED,
      credentials: options.credentials,
      topology
    };

    // create the connection pool
    // NOTE: this used to happen in `connect`, we supported overriding pool options there
    const addressParts = this.description.address.split(':');
    const poolOptions = Object.assign(
      { host: addressParts[0], port: parseInt(addressParts[1], 10) },
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
   * @param {boolean} [options.force=false] Force destroy the pool
   * @param {any} callback
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
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.checkKeys=false] Specify if the bson parser should validate keys.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {(error?: Error, result?: any) => void} callback A callback function
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

    this.s.pool.withConnection((err, conn, cb) => {
      if (err) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.command(ns, cmd, options, makeOperationHandler(this, options, cb));
    }, callback);
  }

  /**
   * Execute a query against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command document for the query
   * @param {any} cursorState
   * @param {object} options Optional settings
   * @param {Function} callback
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

      conn.query(ns, cmd, cursorState, options, makeOperationHandler(this, options, cb));
    }, callback);
  }

  /**
   * Execute a `getMore` against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cursorState State data associated with the cursor calling this method
   * @param {any} batchSize
   * @param {object} options Optional settings
   * @param {Function} callback
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

      conn.getMore(ns, cursorState, batchSize, options, makeOperationHandler(this, options, cb));
    }, callback);
  }

  /**
   * Execute a `killCursors` command against the server
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cursorState State data associated with the cursor calling this method
   * @param {Function} callback
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

      conn.killCursors(ns, cursorState, makeOperationHandler(this, null, cb));
    }, callback);
  }

  /**
   * Insert one or more documents
   *
   * @function
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {Array} ops An array of documents to insert
   * @param {object} options
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {(error?: Error, result?: any) => void} callback A callback function
   */
  insert(ns, ops, options, callback) {
    executeWriteOperation({ server: this, op: 'insert', ns, ops }, options, callback);
  }

  /**
   * Perform one or more update operations
   *
   * @function
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {Array} ops An array of updates
   * @param {object} options
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {(error?: Error, result?: any) => void} callback A callback function
   */
  update(ns, ops, options, callback) {
    executeWriteOperation({ server: this, op: 'update', ns, ops }, options, callback);
  }

  /**
   * Perform one or more remove operations
   *
   * @function
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {Array} ops An array of removes
   * @param {object} options options for removal
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {(error?: Error, result?: any) => void} callback A callback function
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
  if (maxWireVersion(server) < 5) {
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

    conn[op](ns, ops, options, makeOperationHandler(server, options, cb));
  }, callback);
}

function markServerUnknown(server, error) {
  server.emit(
    'descriptionReceived',
    new ServerDescription(server.description.address, null, { error })
  );
}

function makeOperationHandler(server, options, callback) {
  return function handleOperationResult(err, result) {
    if (err) {
      if (err instanceof MongoNetworkError) {
        if (options && options.session) {
          options.session.serverSession.isDirty = true;
        }

        if (supportsRetryableWrites(server)) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (!isNetworkTimeoutError(err)) {
          markServerUnknown(server, err);
          server.s.pool.clear();
        }
      } else {
        // if pre-4.4 server, then add error label if its a retryable write error
        if (maxWireVersion(server) < 9 && isRetryableWriteError(err)) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (isSDAMUnrecoverableError(err)) {
          if (maxWireVersion(server) <= 7 || isNodeShuttingDownError(err)) {
            server.s.pool.clear();
          }

          markServerUnknown(server, err);
          process.nextTick(() => server.requestCheck());
        }
      }
    }

    callback(err, result);
  };
}

module.exports = {
  Server
};
