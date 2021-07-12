import * as net from 'net';
import * as tls from 'tls';
import { Connection, ConnectionOptions, CryptoConnection } from './connection';
import {
  MongoNetworkError,
  MongoNetworkTimeoutError,
  AnyError,
  MongoDriverError,
  MongoServerError
} from '../error';
import { AUTH_PROVIDERS, AuthMechanism } from './auth/defaultAuthProviders';
import { AuthContext } from './auth/auth_provider';
import { makeClientMetadata, ClientMetadata, Callback, CallbackWithType, ns } from '../utils';
import {
  MAX_SUPPORTED_WIRE_VERSION,
  MAX_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION
} from './wire_protocol/constants';
import type { Document } from '../bson';

import type { Socket, SocketConnectOpts } from 'net';
import type { TLSSocket, ConnectionOptions as TLSConnectionOpts } from 'tls';
import { Int32 } from '../bson';

/** @public */
export type Stream = Socket | TLSSocket;

export function connect(options: ConnectionOptions, callback: Callback<Connection>): void {
  makeConnection(options, (err, socket) => {
    if (err || !socket) {
      return callback(err);
    }

    let ConnectionType = options.connectionType ?? Connection;
    if (options.autoEncrypter) {
      ConnectionType = CryptoConnection;
    }
    performInitialHandshake(new ConnectionType(socket, options), options, callback);
  });
}

function checkSupportedServer(ismaster: Document, options: ConnectionOptions) {
  const serverVersionHighEnough =
    ismaster &&
    (typeof ismaster.maxWireVersion === 'number' || ismaster.maxWireVersion instanceof Int32) &&
    ismaster.maxWireVersion >= MIN_SUPPORTED_WIRE_VERSION;
  const serverVersionLowEnough =
    ismaster &&
    (typeof ismaster.minWireVersion === 'number' || ismaster.minWireVersion instanceof Int32) &&
    ismaster.minWireVersion <= MAX_SUPPORTED_WIRE_VERSION;

  if (serverVersionHighEnough) {
    if (serverVersionLowEnough) {
      return null;
    }

    const message = `Server at ${options.hostAddress} reports minimum wire version ${JSON.stringify(
      ismaster.minWireVersion
    )}, but this version of the Node.js Driver requires at most ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
    return new MongoDriverError(message);
  }

  const message = `Server at ${options.hostAddress} reports maximum wire version ${
    JSON.stringify(ismaster.maxWireVersion) ?? 0
  }, but this version of the Node.js Driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION})`;
  return new MongoDriverError(message);
}

function performInitialHandshake(
  conn: Connection,
  options: ConnectionOptions,
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
    if (
      !(credentials.mechanism === AuthMechanism.MONGODB_DEFAULT) &&
      !AUTH_PROVIDERS.get(credentials.mechanism)
    ) {
      callback(new MongoDriverError(`authMechanism '${credentials.mechanism}' not supported`));
      return;
    }
  }

  const authContext = new AuthContext(conn, credentials, options);
  prepareHandshakeDocument(authContext, (err, handshakeDoc) => {
    if (err || !handshakeDoc) {
      return callback(err);
    }

    const handshakeOptions: Document = Object.assign({}, options);
    if (typeof options.connectTimeoutMS === 'number') {
      // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
      handshakeOptions.socketTimeoutMS = options.connectTimeoutMS;
    }

    const start = new Date().getTime();
    conn.command(ns('admin.$cmd'), handshakeDoc, handshakeOptions, (err, response) => {
      if (err) {
        callback(err);
        return;
      }

      if (response?.ok === 0) {
        callback(new MongoServerError(response));
        return;
      }

      if ('isWritablePrimary' in response) {
        // Provide pre-hello-style response document.
        response.ismaster = response.isWritablePrimary;
      }

      if (response.helloOk) {
        conn.helloOk = true;
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
        authContext.response = response;

        const resolvedCredentials = credentials.resolveAuthMechanism(response);
        const provider = AUTH_PROVIDERS.get(resolvedCredentials.mechanism);
        if (!provider) {
          return callback(
            new MongoDriverError(`No AuthProvider for ${resolvedCredentials.mechanism} defined.`)
          );
        }
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
  ismaster?: boolean;
  hello?: boolean;
  helloOk?: boolean;
  client: ClientMetadata;
  compression: string[];
  saslSupportedMechs?: string;
}

function prepareHandshakeDocument(authContext: AuthContext, callback: Callback<HandshakeDocument>) {
  const options = authContext.options;
  const compressors = options.compressors ? options.compressors : [];
  const { serverApi } = authContext.connection;

  const handshakeDoc: HandshakeDocument = {
    [serverApi?.version ? 'hello' : 'ismaster']: true,
    helloOk: true,
    client: options.metadata || makeClientMetadata(options),
    compression: compressors
  };

  const credentials = authContext.credentials;
  if (credentials) {
    if (credentials.mechanism === AuthMechanism.MONGODB_DEFAULT && credentials.username) {
      handshakeDoc.saslSupportedMechs = `${credentials.source}.${credentials.username}`;

      const provider = AUTH_PROVIDERS.get(AuthMechanism.MONGODB_SCRAM_SHA256);
      if (!provider) {
        // This auth mechanism is always present.
        return callback(
          new MongoDriverError(`No AuthProvider for ${AuthMechanism.MONGODB_SCRAM_SHA256} defined.`)
        );
      }
      return provider.prepare(handshakeDoc, authContext, callback);
    }
    const provider = AUTH_PROVIDERS.get(credentials.mechanism);
    if (!provider) {
      return callback(
        new MongoDriverError(`No AuthProvider for ${credentials.mechanism} defined.`)
      );
    }
    return provider.prepare(handshakeDoc, authContext, callback);
  }
  callback(undefined, handshakeDoc);
}

/** @public */
export const LEGAL_TLS_SOCKET_OPTIONS = [
  'ALPNProtocols',
  'ca',
  'cert',
  'checkServerIdentity',
  'ciphers',
  'crl',
  'ecdhCurve',
  'key',
  'minDHSize',
  'passphrase',
  'pfx',
  'rejectUnauthorized',
  'secureContext',
  'secureProtocol',
  'servername',
  'session'
] as const;

/** @public */
export const LEGAL_TCP_SOCKET_OPTIONS = [
  'family',
  'hints',
  'localAddress',
  'localPort',
  'lookup'
] as const;

function parseConnectOptions(options: ConnectionOptions): SocketConnectOpts {
  const hostAddress = options.hostAddress;
  if (!hostAddress) throw new MongoDriverError('HostAddress required');

  const result: Partial<net.TcpNetConnectOpts & net.IpcNetConnectOpts> = {};
  for (const name of LEGAL_TCP_SOCKET_OPTIONS) {
    if (options[name] != null) {
      (result as Document)[name] = options[name];
    }
  }

  if (typeof hostAddress.socketPath === 'string') {
    result.path = hostAddress.socketPath;
    return result as net.IpcNetConnectOpts;
  } else if (typeof hostAddress.host === 'string') {
    result.host = hostAddress.host;
    result.port = hostAddress.port;
    return result as net.TcpNetConnectOpts;
  } else {
    // This should never happen since we set up HostAddresses
    // But if we don't throw here the socket could hang until timeout
    throw new MongoDriverError(`Unexpected HostAddress ${JSON.stringify(hostAddress)}`);
  }
}

function parseSslOptions(options: ConnectionOptions): TLSConnectionOpts {
  const result: TLSConnectionOpts = parseConnectOptions(options);
  // Merge in valid SSL options
  for (const name of LEGAL_TLS_SOCKET_OPTIONS) {
    if (options[name] != null) {
      (result as Document)[name] = options[name];
    }
  }

  // Set default sni servername to be the same as host
  if (result.servername == null && result.host && !net.isIP(result.host)) {
    result.servername = result.host;
  }

  return result;
}

const SOCKET_ERROR_EVENT_LIST = ['error', 'close', 'timeout', 'parseError'] as const;
type ErrorHandlerEventName = typeof SOCKET_ERROR_EVENT_LIST[number] | 'cancel';
const SOCKET_ERROR_EVENTS = new Set(SOCKET_ERROR_EVENT_LIST);

function makeConnection(options: ConnectionOptions, _callback: CallbackWithType<AnyError, Stream>) {
  const useTLS = options.tls ?? false;
  const keepAlive = options.keepAlive ?? true;
  const socketTimeoutMS = options.socketTimeoutMS ?? Reflect.get(options, 'socketTimeout') ?? 0;
  const noDelay = options.noDelay ?? true;
  const connectionTimeout = options.connectTimeoutMS ?? 30000;
  const rejectUnauthorized = options.rejectUnauthorized ?? true;
  const keepAliveInitialDelay =
    ((options.keepAliveInitialDelay ?? 120000) > socketTimeoutMS
      ? Math.round(socketTimeoutMS / 2)
      : options.keepAliveInitialDelay) ?? 120000;

  let socket: Stream;
  const callback: Callback<Stream> = function (err, ret) {
    if (err && socket) {
      socket.destroy();
    }

    _callback(err, ret);
  };

  if (useTLS) {
    const tlsSocket = tls.connect(parseSslOptions(options));
    if (typeof tlsSocket.disableRenegotiation === 'function') {
      tlsSocket.disableRenegotiation();
    }
    socket = tlsSocket;
  } else {
    socket = net.createConnection(parseConnectOptions(options));
  }

  socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
  socket.setTimeout(connectionTimeout);
  socket.setNoDelay(noDelay);

  const connectEvent = useTLS ? 'secureConnect' : 'connect';
  let cancellationHandler: (err: Error) => void;
  function errorHandler(eventName: ErrorHandlerEventName) {
    return (err: Error) => {
      SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
      if (cancellationHandler && options.cancellationToken) {
        options.cancellationToken.removeListener('cancel', cancellationHandler);
      }

      socket.removeListener(connectEvent, connectHandler);
      callback(connectionFailureError(eventName, err));
    };
  }

  function connectHandler() {
    SOCKET_ERROR_EVENTS.forEach(event => socket.removeAllListeners(event));
    if (cancellationHandler && options.cancellationToken) {
      options.cancellationToken.removeListener('cancel', cancellationHandler);
    }

    if ('authorizationError' in socket) {
      if (socket.authorizationError && rejectUnauthorized) {
        return callback(socket.authorizationError);
      }
    }

    socket.setTimeout(socketTimeoutMS);
    callback(undefined, socket);
  }

  SOCKET_ERROR_EVENTS.forEach(event => socket.once(event, errorHandler(event)));
  if (options.cancellationToken) {
    cancellationHandler = errorHandler('cancel');
    options.cancellationToken.once('cancel', cancellationHandler);
  }

  socket.once(connectEvent, connectHandler);
}

function connectionFailureError(type: string, err: Error) {
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
