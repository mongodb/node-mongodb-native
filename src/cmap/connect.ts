import * as net from 'net';
import * as tls from 'tls';
import { Connection, MongoDBConnectionOptions } from './connection';
import { MongoError, MongoNetworkError, MongoNetworkTimeoutError } from '../error';
import { AUTH_PROVIDERS } from './auth/defaultAuthProviders';
import { AuthContext } from './auth/auth_provider';
import { makeClientMetadata, ClientMetadataOptions, ClientMetadata } from '../utils';
import {
  MAX_SUPPORTED_WIRE_VERSION,
  MAX_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION
} from './wire_protocol/constants';
import type { Callback, CallbackWithType, Document, UniversalError } from '../types';
import type { EventEmitter } from 'events';

import type { Socket, SocketConnectOpts } from 'net';
import type { TLSSocket, ConnectionOptions as TLSConnectionOpts } from 'tls';

type UniversalSocket = Socket | TLSSocket;

export function connect(
  options: MongoDBConnectionOptions,
  callback: Callback<Connection | UniversalSocket>
): void;
export function connect(
  options: MongoDBConnectionOptions,
  cancellationToken: EventEmitter,
  callback: Callback<Connection | UniversalSocket>
): void;
export function connect(
  options: MongoDBConnectionOptions,
  _cancellationToken: EventEmitter | Callback<Connection | UniversalSocket>,
  _callback?: Callback<Connection | UniversalSocket>
): void {
  let cancellationToken = _cancellationToken as EventEmitter | undefined;
  const callback = (_callback ?? _cancellationToken) as Callback<Connection | UniversalSocket>;
  if ('function' === typeof cancellationToken) {
    cancellationToken = undefined;
  }

  const ConnectionType: typeof Connection =
    options && options.connectionType ? options.connectionType : Connection;
  const family = options.family !== undefined ? options.family : 0;

  makeConnection(family, options, cancellationToken, (err, socket) => {
    if (err || !socket) {
      callback(err, socket); // in the error case, `socket` is the originating error event name
      return;
    }

    performInitialHandshake(new ConnectionType(socket, options), options, callback);
  });
}

function checkSupportedServer(ismaster: Document, options: MongoDBConnectionOptions) {
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
  options: MongoDBConnectionOptions,
  _callback: Callback
) {
  const callback: Callback<Document> = function (err, ret) {
    if (err && conn) {
      conn.destroy();
    }
    _callback(err, ret);
  };

  const credentials = options.credentials;
  if (credentials) {
    if (!credentials.mechanism.match(/DEFAULT/i) && !AUTH_PROVIDERS.has(credentials.mechanism)) {
      callback(new MongoError(`authMechanism '${credentials.mechanism}' not supported`));
      return;
    }
  }

  const authContext = new AuthContext(conn, credentials, options);
  prepareHandshakeDocument(authContext, (err, handshakeDoc) => {
    if (err || !handshakeDoc) {
      return callback(err);
    }

    const handshakeOptions: Document = Object.assign({}, options);
    if (options.connectTimeoutMS || options.connectionTimeout) {
      // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
      handshakeOptions.socketTimeout = options.connectTimeoutMS || options.connectionTimeout;
    }

    const start = new Date().getTime();
    conn.command('admin.$cmd', handshakeDoc, handshakeOptions, (err, result) => {
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
        const AuthProvider = AUTH_PROVIDERS.get(resolvedCredentials.mechanism);
        if (!AuthProvider) {
          return callback(
            new MongoError(
              `Authentication Mechanism ${resolvedCredentials.mechanism} is not supported.`
            )
          );
        }
        const provider = new AuthProvider();
        provider.auth(authContext, err => {
          if (err) return callback(err);
          callback(undefined, conn);
        });

        return;
      }

      callback(undefined, conn);
    });
  });
}

export interface HandshakeDocument extends Document {
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

      let AuthProvider;
      if ((AuthProvider = AUTH_PROVIDERS.get('scram-sha-256'))) {
        // This auth mechanism is always present.
        const provider = new AuthProvider();
        provider.prepare(handshakeDoc, authContext, callback);
        return;
      }
    }

    const AuthProvider = AUTH_PROVIDERS.get(credentials.mechanism);
    if (!AuthProvider) {
      return callback(
        new MongoError(`Authentication Mechanism ${credentials.mechanism} is not supported.`)
      );
    }
    const provider = new AuthProvider();
    provider.prepare(handshakeDoc, authContext, callback);
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

function parseConnectOptions(family: number, options: MongoDBConnectionOptions): SocketConnectOpts {
  const host = typeof options.host === 'string' ? options.host : 'localhost';

  if (host.indexOf('/') !== -1) {
    // socket is a unix path
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

function parseSslOptions(family: number, options: MongoDBConnectionOptions): TLSConnectionOpts {
  const result: TLSConnectionOpts & { [key: string]: any } = parseConnectOptions(family, options);
  // Merge in valid SSL options
  for (const name of LEGAL_SSL_SOCKET_OPTIONS) {
    if (options[name]) {
      result[name] = options[name];
    }
  }

  // Override checkServerIdentity behavior
  if (!options.checkServerIdentity) {
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
  options: MongoDBConnectionOptions,
  cancellationToken: EventEmitter | undefined,
  _callback: CallbackWithType<UniversalError, UniversalSocket>
) {
  const useSsl = options.ssl ?? false;
  const keepAlive = options.keepAlive ?? true;
  let keepAliveInitialDelay =
    typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 120000;
  const noDelay = options.noDelay ?? true;
  const connectionTimeout =
    typeof options.connectionTimeout === 'number'
      ? options.connectionTimeout
      : typeof options.connectTimeoutMS === 'number'
      ? options.connectTimeoutMS
      : 30000;
  const socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
  const rejectUnauthorized = options.rejectUnauthorized ?? true;

  if (keepAliveInitialDelay > socketTimeout) {
    keepAliveInitialDelay = Math.round(socketTimeout / 2);
  }

  let socket: UniversalSocket;
  const callback: CallbackWithType<UniversalError, UniversalSocket> = function (err, ret) {
    if (err && socket) {
      socket.destroy();
    }

    _callback(err, ret);
  };

  try {
    if (useSsl) {
      const tlsSocket = tls.connect(parseSslOptions(family, options));
      if (typeof tlsSocket.disableRenegotiation === 'function') {
        tlsSocket.disableRenegotiation();
      }
      socket = tlsSocket;
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
  let cancellationHandler: (err: Error) => void;
  function errorHandler(eventName: typeof socketErrorEventList[number] | 'cancel') {
    return (err: Error) => {
      SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
      if (cancellationHandler && cancellationToken) {
        cancellationToken.removeListener('cancel', cancellationHandler);
      }

      socket.removeListener(connectEvent, connectHandler);
      callback(connectionFailureError(eventName, err));
    };
  }

  function connectHandler() {
    SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
    if (cancellationHandler && cancellationToken) {
      cancellationToken.removeListener('cancel', cancellationHandler);
    }

    if (isTLSSocket(socket)) {
      if (socket.authorizationError && rejectUnauthorized) {
        return callback(socket.authorizationError);
      }
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

function isTLSSocket(socket: UniversalSocket): socket is TLSSocket {
  return 'boolean' === typeof (socket as TLSSocket).authorized;
}
