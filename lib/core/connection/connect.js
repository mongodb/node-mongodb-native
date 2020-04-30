'use strict';
const net = require('net');
const tls = require('tls');
const Connection = require('./connection');
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const defaultAuthProviders = require('../auth/defaultAuthProviders').defaultAuthProviders;
const WIRE_CONSTANTS = require('../wireprotocol/constants');
const makeClientMetadata = require('../utils').makeClientMetadata;
const MAX_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_WIRE_VERSION;
const MAX_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_SERVER_VERSION;
const MIN_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_WIRE_VERSION;
const MIN_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_SERVER_VERSION;
let AUTH_PROVIDERS;

function connect(options, cancellationToken, callback) {
  if (typeof cancellationToken === 'function') {
    callback = cancellationToken;
    cancellationToken = undefined;
  }

  const ConnectionType = options && options.connectionType ? options.connectionType : Connection;
  if (AUTH_PROVIDERS == null) {
    AUTH_PROVIDERS = defaultAuthProviders(options.bson);
  }

  const family = options.family !== void 0 ? options.family : 0;
  makeConnection(family, options, cancellationToken, (err, socket) => {
    if (err) {
      callback(err, socket); // in the error case, `socket` is the originating error event name
      return;
    }

    performInitialHandshake(new ConnectionType(socket, options), options, callback);
  });
}

function isModernConnectionType(conn) {
  return !(conn instanceof Connection);
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

    const message = `Server at ${options.host}:${options.port} reports minimum wire version ${ismaster.minWireVersion}, but this version of the Node.js Driver requires at most ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
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
      client: options.metadata || makeClientMetadata(options),
      compression: compressors
    },
    getSaslSupportedMechs(options)
  );

  const handshakeOptions = Object.assign({}, options);

  // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
  if (options.connectTimeoutMS || options.connectionTimeout) {
    handshakeOptions.socketTimeout = options.connectTimeoutMS || options.connectionTimeout;
  }

  const start = new Date().getTime();
  conn.command('admin.$cmd', handshakeDoc, handshakeOptions, (err, result) => {
    if (err) {
      callback(err);
      return;
    }

    const ismaster = result.result;
    if (ismaster.ok === 0) {
      callback(new MongoError(ismaster));
      return;
    }

    const supportedServerErr = checkSupportedServer(ismaster, options);
    if (supportedServerErr) {
      callback(supportedServerErr);
      return;
    }

    if (!isModernConnectionType(conn)) {
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

    callback(undefined, conn);
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

const SOCKET_ERROR_EVENTS = new Set(['error', 'close', 'timeout', 'parseError']);
function makeConnection(family, options, cancellationToken, _callback) {
  const useSsl = typeof options.ssl === 'boolean' ? options.ssl : false;
  const keepAlive = typeof options.keepAlive === 'boolean' ? options.keepAlive : true;
  let keepAliveInitialDelay =
    typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 300000;
  const noDelay = typeof options.noDelay === 'boolean' ? options.noDelay : true;
  const connectionTimeout =
    typeof options.connectionTimeout === 'number'
      ? options.connectionTimeout
      : typeof options.connectTimeoutMS === 'number'
      ? options.connectTimeoutMS
      : 30000;
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

  const connectEvent = useSsl ? 'secureConnect' : 'connect';
  let cancellationHandler;
  function errorHandler(eventName) {
    return err => {
      SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
      if (cancellationHandler) {
        cancellationToken.removeListener('cancel', cancellationHandler);
      }

      socket.removeListener(connectEvent, connectHandler);
      callback(connectionFailureError(eventName, err));
    };
  }

  function connectHandler() {
    SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
    if (cancellationHandler) {
      cancellationToken.removeListener('cancel', cancellationHandler);
    }

    if (socket.authorizationError && rejectUnauthorized) {
      return callback(socket.authorizationError);
    }

    socket.setTimeout(socketTimeout);
    callback(null, socket);
  }

  SOCKET_ERROR_EVENTS.forEach(event => socket.once(event, errorHandler(event)));
  if (cancellationToken) {
    cancellationHandler = errorHandler('cancel');
    cancellationToken.once('cancel', cancellationHandler);
  }

  socket.once(connectEvent, connectHandler);
}

function authenticate(conn, credentials, callback) {
  const mechanism = credentials.mechanism;
  if (!AUTH_PROVIDERS[mechanism]) {
    callback(new MongoError(`authMechanism '${mechanism}' not supported`));
    return;
  }

  const provider = AUTH_PROVIDERS[mechanism];
  provider.auth(conn, credentials, err => {
    if (err) return callback(err);
    callback(undefined, conn);
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
    case 'cancel':
      return new MongoNetworkError(`connection establishment was cancelled`);
    default:
      return new MongoNetworkError(`unknown network error`);
  }
}

module.exports = connect;
