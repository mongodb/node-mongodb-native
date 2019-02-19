'use strict';
const net = require('net');
const tls = require('tls');
const Connection = require('./connection');
const Query = require('./commands').Query;
const createClientInfo = require('../topologies/shared').createClientInfo;
const MongoError = require('../error').MongoError;

function connect(options, callback) {
  if (options.family !== void 0) {
    makeConnection(options.family, options, (err, socket) => {
      if (err) {
        callback(err, socket); // in the error case, `socket` is the originating error event name
        return;
      }

      performInitialHandshake(new Connection(socket, options), options, callback);
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

        performInitialHandshake(new Connection(ipv4Socket, options), options, callback);
      });

      return;
    }

    performInitialHandshake(new Connection(ipv6Socket, options), options, callback);
  });
}

function isSupportedServer(ismaster) {
  return ismaster && typeof ismaster.maxWireVersion === 'number' && ismaster.maxWireVersion >= 2;
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

function performInitialHandshake(conn, options, callback) {
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

    if (!isSupportedServer(ismaster)) {
      const latestSupportedVersion = '2.6';
      const latestSupportedMaxWireVersion = 2;
      const message =
        'Server at ' +
        options.host +
        ':' +
        options.port +
        ' reports wire version ' +
        (ismaster.maxWireVersion || 0) +
        ', but this version of Node.js Driver requires at least ' +
        latestSupportedMaxWireVersion +
        ' (MongoDB' +
        latestSupportedVersion +
        ').';

      callback(new MongoError(message), null);
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

function makeConnection(family, options, callback) {
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
  try {
    if (useSsl) {
      socket = tls.connect(parseSslOptions(family, options));
    } else {
      socket = net.createConnection(parseConnectOptions(family, options));
    }
  } catch (err) {
    return callback(err);
  }

  socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
  socket.setTimeout(connectionTimeout);
  socket.setNoDelay(noDelay);

  const errorEvents = ['error', 'close', 'timeout', 'parseError', 'connect'];
  function errorHandler(eventName) {
    return err => {
      if (err == null || err === false) err = true;
      errorEvents.forEach(event => socket.removeAllListeners(event));
      socket.removeListener('connect', connectHandler);
      callback(err, eventName);
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
  const socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
  const bson = conn.options.bson;
  const query = new Query(bson, ns, command, {
    numberToSkip: 0,
    numberToReturn: 1
  });

  function errorHandler(err) {
    conn.resetSocketTimeout();
    CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
    conn.removeListener('message', messageHandler);
    callback(err, null);
  }

  function messageHandler(msg) {
    if (msg.responseTo !== query.requestId) {
      return;
    }

    conn.resetSocketTimeout();
    CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
    conn.removeListener('message', messageHandler);

    msg.parse({ promoteValues: true });
    callback(null, msg.documents[0]);
  }

  conn.setSocketTimeout(socketTimeout);
  CONNECTION_ERROR_EVENTS.forEach(eventName => conn.once(eventName, errorHandler));
  conn.on('message', messageHandler);
  conn.write(query.toBin());
}

module.exports = connect;
