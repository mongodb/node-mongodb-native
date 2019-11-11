'use strict';
const net = require('net');
const tls = require('tls');
const Connection = require('./connection');
const Query = require('./commands').Query;
const createClientInfo = require('../topologies/shared').createClientInfo;
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const defaultAuthProviders = require('../auth/defaultAuthProviders').defaultAuthProviders;
const WIRE_CONSTANTS = require('../wireprotocol/constants');
const MAX_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_WIRE_VERSION;
const MAX_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_SERVER_VERSION;
const MIN_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_WIRE_VERSION;
const MIN_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_SERVER_VERSION;
let AUTH_PROVIDERS;

function connect(options, callback) {
  const ConnectionType = options && options.connectionType ? options.connectionType : Connection;
  if (AUTH_PROVIDERS == null) {
    AUTH_PROVIDERS = defaultAuthProviders(options.bson);
  }

  if (options.family !== void 0) {
    makeConnection(options.family, options, (err, socket) => {
      if (err) {
        callback(err, socket); // in the error case, `socket` is the originating error event name
        return;
      }

      performInitialHandshake(new ConnectionType(socket, options), options, callback);
    });

    return;
  }

  return makeConnection(6, options, (err, ipv6Socket) => {
    if (err) {
      makeConnection(4, options, (err, ipv4Socket) => {
        if (err) {
          callback(err, ipv4Socket); // in the error case, `ipv4Socket` is the originating error event name
          return;
        }

        performInitialHandshake(new ConnectionType(ipv4Socket, options), options, callback);
      });

      return;
    }

    performInitialHandshake(new ConnectionType(ipv6Socket, options), options, callback);
  });
}

function getSaslSupportedMechs(options) {
  if (!(options && options.credentials)) {
    return {};
  }

  const credentials = options.credentials;

  // TODO: revisit whether or not items like `options.user` and `options.dbName` should be checked here
  const authMechanism = credentials.mechanism;
  const authSource = credentials.source || options.dbName || 'admin';
  const user = credentials.username || options.user;

  if (typeof authMechanism === 'string' && authMechanism.toUpperCase() !== 'DEFAULT') {
    return {};
  }

  if (!user) {
    return {};
  }

  return { saslSupportedMechs: `${authSource}.${user}` };
}

function checkSupportedServer(ismaster, options) {
  const serverVersionHighEnough =
    ismaster &&
    typeof ismaster.maxWireVersion === 'number' &&
    ismaster.maxWireVersion >= MIN_SUPPORTED_WIRE_VERSION;
  const serverVersionLowEnough =
    ismaster &&
    typeof ismaster.minWireVersion === 'number' &&
    ismaster.minWireVersion <= MAX_SUPPORTED_WIRE_VERSION;

  if (serverVersionHighEnough) {
    if (serverVersionLowEnough) {
      return null;
    }

    const message = `Server at ${options.host}:${options.port} reports minimum wire version ${
      ismaster.minWireVersion
    }, but this version of the Node.js Driver requires at most ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
    return new MongoError(message);
  }

  const message = `Server at ${options.host}:${
    options.port
  } reports maximum wire version ${ismaster.maxWireVersion ||
    0}, but this version of the Node.js Driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION})`;
  return new MongoError(message);
}

function performInitialHandshake(conn, options, _callback) {
  const callback = function(err, ret) {
    if (err && conn) {
      conn.destroy();
    }
    _callback(err, ret);
  };

  let compressors = [];
  if (options.compression && options.compression.compressors) {
    compressors = options.compression.compressors;
  }

  const handshakeDoc = Object.assign(
    {
      ismaster: true,
      client: createClientInfo(options),
      compression: compressors
    },
    getSaslSupportedMechs(options)
  );

  const start = new Date().getTime();
  runCommand(conn, 'admin.$cmd', handshakeDoc, options, (err, ismaster) => {
    if (err) {
      callback(err, null);
      return;
    }

    if (ismaster.ok === 0) {
      callback(new MongoError(ismaster), null);
      return;
    }

    const supportedServerErr = checkSupportedServer(ismaster, options);
    if (supportedServerErr) {
      callback(supportedServerErr, null);
      return;
    }

    // resolve compression
    if (ismaster.compression) {
      const agreedCompressors = compressors.filter(
        compressor => ismaster.compression.indexOf(compressor) !== -1
      );

      if (agreedCompressors.length) {
        conn.agreedCompressor = agreedCompressors[0];
      }

      if (options.compression && options.compression.zlibCompressionLevel) {
        conn.zlibCompressionLevel = options.compression.zlibCompressionLevel;
      }
    }

    // NOTE: This is metadata attached to the connection while porting away from
    //       handshake being done in the `Server` class. Likely, it should be
    //       relocated, or at very least restructured.
    conn.ismaster = ismaster;
    conn.lastIsMasterMS = new Date().getTime() - start;

    const credentials = options.credentials;
    if (!ismaster.arbiterOnly && credentials) {
      credentials.resolveAuthMechanism(ismaster);
      authenticate(conn, credentials, callback);
      return;
    }

    callback(null, conn);
  });
}

const LEGAL_SSL_SOCKET_OPTIONS = [
  'pfx',
  'key',
  'passphrase',
  'cert',
  'ca',
  'ciphers',
  'NPNProtocols',
  'ALPNProtocols',
  'servername',
  'ecdhCurve',
  'secureProtocol',
  'secureContext',
  'session',
  'minDHSize',
  'crl',
  'rejectUnauthorized'
];

function parseConnectOptions(family, options) {
  const host = typeof options.host === 'string' ? options.host : 'localhost';
  if (host.indexOf('/') !== -1) {
    return { path: host };
  }

  const result = {
    family,
    host,
    port: typeof options.port === 'number' ? options.port : 27017,
    rejectUnauthorized: false
  };

  return result;
}

function parseSslOptions(family, options) {
  const result = parseConnectOptions(family, options);

  // Merge in valid SSL options
  for (const name in options) {
    if (options[name] != null && LEGAL_SSL_SOCKET_OPTIONS.indexOf(name) !== -1) {
      result[name] = options[name];
    }
  }

  // Override checkServerIdentity behavior
  if (options.checkServerIdentity === false) {
    // Skip the identiy check by retuning undefined as per node documents
    // https://nodejs.org/api/tls.html#tls_tls_connect_options_callback
    result.checkServerIdentity = function() {
      return undefined;
    };
  } else if (typeof options.checkServerIdentity === 'function') {
    result.checkServerIdentity = options.checkServerIdentity;
  }

  // Set default sni servername to be the same as host
  if (result.servername == null) {
    result.servername = result.host;
  }

  return result;
}

function makeConnection(family, options, _callback) {
  const useSsl = typeof options.ssl === 'boolean' ? options.ssl : false;
  const keepAlive = typeof options.keepAlive === 'boolean' ? options.keepAlive : true;
  let keepAliveInitialDelay =
    typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 300000;
  const noDelay = typeof options.noDelay === 'boolean' ? options.noDelay : true;
  const connectionTimeout =
    typeof options.connectionTimeout === 'number' ? options.connectionTimeout : 30000;
  const socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
  const rejectUnauthorized =
    typeof options.rejectUnauthorized === 'boolean' ? options.rejectUnauthorized : true;

  if (keepAliveInitialDelay > socketTimeout) {
    keepAliveInitialDelay = Math.round(socketTimeout / 2);
  }

  let socket;
  const callback = function(err, ret) {
    if (err && socket) {
      socket.destroy();
    }
    _callback(err, ret);
  };

  try {
    if (useSsl) {
      socket = tls.connect(parseSslOptions(family, options));
      if (typeof socket.disableRenegotiation === 'function') {
        socket.disableRenegotiation();
      }
    } else {
      socket = net.createConnection(parseConnectOptions(family, options));
    }
  } catch (err) {
    return callback(err);
  }

  socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
  socket.setTimeout(connectionTimeout);
  socket.setNoDelay(noDelay);

  const errorEvents = ['error', 'close', 'timeout', 'parseError'];
  function errorHandler(eventName) {
    return err => {
      errorEvents.forEach(event => socket.removeAllListeners(event));
      socket.removeListener('connect', connectHandler);
      callback(connectionFailureError(eventName, err), eventName);
    };
  }

  function connectHandler() {
    errorEvents.forEach(event => socket.removeAllListeners(event));
    if (socket.authorizationError && rejectUnauthorized) {
      return callback(socket.authorizationError);
    }

    socket.setTimeout(socketTimeout);
    callback(null, socket);
  }

  socket.once('error', errorHandler('error'));
  socket.once('close', errorHandler('close'));
  socket.once('timeout', errorHandler('timeout'));
  socket.once('parseError', errorHandler('parseError'));
  socket.once('connect', connectHandler);
}

const CONNECTION_ERROR_EVENTS = ['error', 'close', 'timeout', 'parseError'];
function runCommand(conn, ns, command, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  const socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
  const bson = conn.options.bson;
  const query = new Query(bson, ns, command, {
    numberToSkip: 0,
    numberToReturn: 1
  });

  const noop = () => {};
  function _callback(err, result) {
    callback(err, result);
    callback = noop;
  }

  function errorHandler(err) {
    conn.resetSocketTimeout();
    CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
    conn.removeListener('message', messageHandler);

    if (err == null) {
      err = new MongoError(`runCommand failed for connection to '${conn.address}'`);
    }

    // ignore all future errors
    conn.on('error', noop);

    _callback(err, null);
  }

  function messageHandler(msg) {
    if (msg.responseTo !== query.requestId) {
      return;
    }

    conn.resetSocketTimeout();
    CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
    conn.removeListener('message', messageHandler);

    msg.parse({ promoteValues: true });
    _callback(null, msg.documents[0]);
  }

  conn.setSocketTimeout(socketTimeout);
  CONNECTION_ERROR_EVENTS.forEach(eventName => conn.once(eventName, errorHandler));
  conn.on('message', messageHandler);
  conn.write(query.toBin());
}

function authenticate(conn, credentials, callback) {
  const mechanism = credentials.mechanism;
  if (!AUTH_PROVIDERS[mechanism]) {
    callback(new MongoError(`authMechanism '${mechanism}' not supported`));
    return;
  }

  const provider = AUTH_PROVIDERS[mechanism];
  provider.auth(runCommand, [conn], credentials, err => {
    if (err) return callback(err);
    callback(null, conn);
  });
}

function connectionFailureError(type, err) {
  switch (type) {
    case 'error':
      return new MongoNetworkError(err);
    case 'timeout':
      return new MongoNetworkError(`connection timed out`);
    case 'close':
      return new MongoNetworkError(`connection closed`);
    default:
      return new MongoNetworkError(`unknown network error`);
  }
}

module.exports = connect;
