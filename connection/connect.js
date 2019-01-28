'use strict';
const net = require('net');
const tls = require('tls');
const Connection = require('./connection');

function connect(options, callback) {
  if (options.family !== void 0) {
    makeConnection(options.family, options, (err, socket) => {
      if (err) {
        return callback(err, socket); // in the error case, `socket` is the originating error event
      }

      callback(null, new Connection(socket, options));
    });

    return;
  }

  return makeConnection(6, options, (err, ipv6Socket) => {
    if (err) {
      // if (this.logger.isDebug()) {
      //   this.logger.debug(
      //     `connection ${this.id} for [${this.address}] errored out with [${JSON.stringify(err)}]`
      //   );
      // }

      makeConnection(4, options, (err, ipv4Socket) => {
        if (err) {
          return callback(err, ipv4Socket); // in the error case, `ipv4Socket` is the originating error event
        }

        callback(null, new Connection(ipv4Socket, options));
      });

      return;
    }

    callback(null, new Connection(ipv6Socket, options));
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
  'minDHSize'
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
  // Set options for ssl
  if (options.ca) result.ca = options.ca;
  if (options.crl) result.crl = options.crl;
  if (options.cert) result.cert = options.cert;
  if (options.key) result.key = options.key;
  if (options.passphrase) result.passphrase = options.passphrase;

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

  if (typeof options.rejectUnauthorized === 'boolean') {
    result.rejectUnauthorized = options.rejectUnauthorized;
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

module.exports = connect;
