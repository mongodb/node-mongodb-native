import * as net from 'net';
import * as tls from 'tls';
import { Connection, ConnectionOptions } from './connection';
import { MongoError, MongoNetworkError, MongoNetworkTimeoutError } from '../error';
import { defaultAuthProviders } from './auth/defaultAuthProviders';
import { AuthContext } from './auth/auth_provider';
import { makeClientMetadata, ClientMetadataOptions, ClientMetadata } from '../utils';
import {
  MAX_SUPPORTED_WIRE_VERSION,
  MAX_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION
} from './wire_protocol/constants';
import type { Callback, CallbackTypedError, Document } from '../types';
import type { EventEmitter } from 'events';
import type { MongoDBInitialResponse } from './types';

const AUTH_PROVIDERS = defaultAuthProviders();

export function connect(
  options: ConnectionOptions,
  cancellationToken: EventEmitter | undefined,
  callback: Callback<Connection>
) {
  if (typeof cancellationToken === 'function') {
    callback = cancellationToken;
    cancellationToken = undefined;
  }

  const ConnectionType: typeof Connection =
    options && options.connectionType ? options.connectionType : Connection;
  const family = options.family !== undefined ? options.family : 0;

  makeConnection(family, options, cancellationToken!, (err, socket) => {
    if (err) {
      callback(err, (socket as unknown) as Connection); // in the error case, `socket` is the originating error event name
      return;
    }

    performInitialHandshake(new ConnectionType(socket!, options), options, callback);
  });
}

function checkSupportedServer(ismaster: MongoDBInitialResponse, options: ConnectionOptions) {
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

  const message = `Server at ${options.host}:${options.port} reports maximum wire version ${
    ismaster.maxWireVersion || 0
  }, but this version of the Node.js Driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION})`;
  return new MongoError(message);
}

function performInitialHandshake(
  conn: Connection,
  options: ConnectionOptions,
  _callback: Callback
) {
  const callback = function (err, ret) {
    if (err && conn) {
      conn.destroy();
    }
    _callback(err, ret);
  } as Callback;

  const credentials = options.credentials;
  if (credentials) {
    if (!credentials.mechanism.match(/DEFAULT/i) && !AUTH_PROVIDERS[credentials.mechanism]) {
      callback(new MongoError(`authMechanism '${credentials.mechanism}' not supported`));
      return;
    }
  }

  const authContext = new AuthContext(conn, credentials, options);
  prepareHandshakeDocument(authContext, (err, handshakeDoc) => {
    if (err) {
      return callback(err);
    }

    const handshakeOptions = Object.assign({}, options);
    if (options.connectTimeoutMS || options.connectionTimeout) {
      // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
      handshakeOptions.socketTimeout = options.connectTimeoutMS || options.connectionTimeout;
    }

    const start = new Date().getTime();
    conn.command('admin.$cmd', handshakeDoc!, handshakeOptions, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      const response = result.result;
      if (response.ok === 0) {
        callback(new MongoError(response));
        return;
      }

      const supportedServerErr = checkSupportedServer(response, options);
      if (supportedServerErr) {
        callback(supportedServerErr);
        return;
      }

      // NOTE: This is metadata attached to the connection while porting away from
      //       handshake being done in the `Server` class. Likely, it should be
      //       relocated, or at very least restructured.
      conn.ismaster = response;
      conn.lastIsMasterMS = new Date().getTime() - start;

      if (!response.arbiterOnly && credentials) {
        // store the response on auth context
        Object.assign(authContext, { response });

        const resolvedCredentials = credentials.resolveAuthMechanism(response);
        const authProvider = AUTH_PROVIDERS[resolvedCredentials.mechanism];
        authProvider.auth(authContext, err => {
          if (err) return callback(err);
          callback(undefined, conn);
        });

        return;
      }

      callback(undefined, conn);
    });
  });
}

interface HandshakeDocument extends Document {
  ismaster: boolean;
  client: ClientMetadata;
  compression: string[];
  saslSupportedMechs?: string;
}

function prepareHandshakeDocument(authContext: AuthContext, callback: Callback<HandshakeDocument>) {
  const options = authContext.options;
  const compressors =
    options.compression && options.compression.compressors ? options.compression.compressors : [];

  const handshakeDoc = {
    ismaster: true,
    client: options.metadata || makeClientMetadata(options as ClientMetadataOptions),
    compression: compressors
  };

  const credentials = authContext.credentials;
  if (credentials) {
    if (credentials.mechanism.match(/DEFAULT/i) && credentials.username) {
      Object.assign(handshakeDoc, {
        saslSupportedMechs: `${credentials.source}.${credentials.username}`
      });

      AUTH_PROVIDERS['scram-sha-256'].prepare(handshakeDoc, authContext, callback);
      return;
    }

    const authProvider = AUTH_PROVIDERS[credentials.mechanism];
    authProvider.prepare(handshakeDoc, authContext, callback);
    return;
  }

  callback(undefined, handshakeDoc);
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

function parseConnectOptions(
  family: number,
  options: ConnectionOptions
): Partial<ConnectionOptions> {
  const host = typeof options.host === 'string' ? options.host : 'localhost';
  if (host.indexOf('/') !== -1) {
    return { path: host };
  }

  const result = {
    family,
    host,
    port: options.port ?? 27017,
    rejectUnauthorized: false
  };

  return result;
}

function parseSslOptions(family: number, options: ConnectionOptions) {
  const result = parseConnectOptions(family, options);
  // Merge in valid SSL options
  for (const name in options) {
    if (options[name] != null && LEGAL_SSL_SOCKET_OPTIONS.indexOf(name) !== -1) {
      result[name] = options[name];
    }
  }

  // Override checkServerIdentity behavior
  if (options.checkServerIdentity === false) {
    // Skip the identity check by retuning undefined as per node documents
    // https://nodejs.org/api/tls.html#tls_tls_connect_options_callback
    result.checkServerIdentity = () => undefined;
  } else if (typeof options.checkServerIdentity === 'function') {
    result.checkServerIdentity = options.checkServerIdentity;
  }

  // Set default sni servername to be the same as host
  if (result.servername == null) {
    result.servername = result.host;
  }

  return result;
}

const socketErrorEventList = ['error', 'close', 'timeout', 'parseError'] as const;
const SOCKET_ERROR_EVENTS = new Set(socketErrorEventList);

function makeConnection(
  family: number,
  options: ConnectionOptions,
  cancellationToken: EventEmitter,
  _callback: CallbackTypedError<Error | MongoError, net.Socket | tls.TLSSocket>
) {
  const useSsl = typeof options.ssl === 'boolean' ? options.ssl : false;
  const keepAlive = typeof options.keepAlive === 'boolean' ? options.keepAlive : true;
  let keepAliveInitialDelay =
    typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 120000;
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

  let socket: net.Socket | tls.TLSSocket;
  const callback = function (err, ret) {
    if (err && socket) {
      socket.destroy();
    }

    _callback(err, ret);
  } as CallbackTypedError<Error | MongoError, net.Socket | tls.TLSSocket>;

  try {
    if (useSsl) {
      socket = tls.connect(parseSslOptions(family, options));
      if (typeof (socket as tls.TLSSocket).disableRenegotiation === 'function') {
        (socket as tls.TLSSocket).disableRenegotiation();
      }
    } else {
      socket = net.createConnection(parseConnectOptions(family, options) as net.NetConnectOpts);
    }
  } catch (err) {
    return callback(err);
  }

  socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
  socket.setTimeout(connectionTimeout);
  socket.setNoDelay(noDelay);

  const connectEvent = useSsl ? 'secureConnect' : 'connect';
  let cancellationHandler: (err: Error) => void;
  function errorHandler(eventName: typeof socketErrorEventList[number] | 'cancel') {
    return (err: Error) => {
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

    if ((socket as tls.TLSSocket).authorizationError && rejectUnauthorized) {
      return callback((socket as tls.TLSSocket).authorizationError);
    }

    socket.setTimeout(socketTimeout);
    callback(undefined, socket);
  }

  SOCKET_ERROR_EVENTS.forEach(event => socket.once(event, errorHandler(event)));
  if (cancellationToken) {
    cancellationHandler = errorHandler('cancel');
    cancellationToken.once('cancel', cancellationHandler);
  }

  socket.once(connectEvent, connectHandler);
}

function connectionFailureError(type: string, err?: Error) {
  switch (type) {
    case 'error':
      return new MongoNetworkError(err);
    case 'timeout':
      return new MongoNetworkTimeoutError('connection timed out');
    case 'close':
      return new MongoNetworkError('connection closed');
    case 'cancel':
      return new MongoNetworkError('connection establishment was cancelled');
    default:
      return new MongoNetworkError('unknown network error');
  }
}
