import type { Socket, SocketConnectOpts } from 'net';
import * as net from 'net';
import { SocksClient } from 'socks';
import type { ConnectionOptions as TLSConnectionOpts, TLSSocket } from 'tls';
import * as tls from 'tls';

import type { Document } from '../bson';
import { Int32 } from '../bson';
import { LEGACY_HELLO_COMMAND } from '../constants';
import {
  MongoCompatibilityError,
  MongoError,
  MongoErrorLabel,
  MongoInvalidArgumentError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoRuntimeError,
  needsRetryableWriteLabel
} from '../error';
import { Callback, ClientMetadata, HostAddress, ns } from '../utils';
import { AuthContext, AuthProvider } from './auth/auth_provider';
import { GSSAPI } from './auth/gssapi';
import { MongoCR } from './auth/mongocr';
import { MongoDBAWS } from './auth/mongodb_aws';
import { MongoDBOIDC } from './auth/mongodb_oidc';
import { Plain } from './auth/plain';
import { AuthMechanism } from './auth/providers';
import { ScramSHA1, ScramSHA256 } from './auth/scram';
import { X509 } from './auth/x509';
import { CommandOptions, Connection, ConnectionOptions, CryptoConnection } from './connection';
import {
  MAX_SUPPORTED_SERVER_VERSION,
  MAX_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION
} from './wire_protocol/constants';

/** @internal */
export const AUTH_PROVIDERS = new Map<AuthMechanism | string, AuthProvider>([
  [AuthMechanism.MONGODB_AWS, new MongoDBAWS()],
  [AuthMechanism.MONGODB_CR, new MongoCR()],
  [AuthMechanism.MONGODB_GSSAPI, new GSSAPI()],
  [AuthMechanism.MONGODB_OIDC, new MongoDBOIDC()],
  [AuthMechanism.MONGODB_PLAIN, new Plain()],
  [AuthMechanism.MONGODB_SCRAM_SHA1, new ScramSHA1()],
  [AuthMechanism.MONGODB_SCRAM_SHA256, new ScramSHA256()],
  [AuthMechanism.MONGODB_X509, new X509()]
]);

/** @public */
export type Stream = Socket | TLSSocket;

export function connect(options: ConnectionOptions, callback: Callback<Connection>): void {
  makeConnection({ ...options, existingSocket: undefined }, (err, socket) => {
    if (err || !socket) {
      return callback(err);
    }

    let ConnectionType = options.connectionType ?? Connection;
    if (options.autoEncrypter) {
      ConnectionType = CryptoConnection;
    }

    const connection = new ConnectionType(socket, options);

    performInitialHandshake(connection, options).then(
      () => callback(undefined, connection),
      error => {
        connection.destroy({ force: false });
        callback(error);
      }
    );
  });
}

function checkSupportedServer(hello: Document, options: ConnectionOptions) {
  const serverVersionHighEnough =
    hello &&
    (typeof hello.maxWireVersion === 'number' || hello.maxWireVersion instanceof Int32) &&
    hello.maxWireVersion >= MIN_SUPPORTED_WIRE_VERSION;
  const serverVersionLowEnough =
    hello &&
    (typeof hello.minWireVersion === 'number' || hello.minWireVersion instanceof Int32) &&
    hello.minWireVersion <= MAX_SUPPORTED_WIRE_VERSION;

  if (serverVersionHighEnough) {
    if (serverVersionLowEnough) {
      return null;
    }

    const message = `Server at ${options.hostAddress} reports minimum wire version ${JSON.stringify(
      hello.minWireVersion
    )}, but this version of the Node.js Driver requires at most ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
    return new MongoCompatibilityError(message);
  }

  const message = `Server at ${options.hostAddress} reports maximum wire version ${
    JSON.stringify(hello.maxWireVersion) ?? 0
  }, but this version of the Node.js Driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION})`;
  return new MongoCompatibilityError(message);
}

async function performInitialHandshake(
  conn: Connection,
  options: ConnectionOptions
): Promise<void> {
  const credentials = options.credentials;

  if (credentials) {
    if (
      !(credentials.mechanism === AuthMechanism.MONGODB_DEFAULT) &&
      !AUTH_PROVIDERS.get(credentials.mechanism)
    ) {
      throw new MongoInvalidArgumentError(`AuthMechanism '${credentials.mechanism}' not supported`);
    }
  }

  const authContext = new AuthContext(conn, credentials, options);
  conn.authContext = authContext;

  const handshakeDoc = await prepareHandshakeDocument(authContext);

  // @ts-expect-error: TODO(NODE-5141): The options need to be filtered properly, Connection options differ from Command options
  const handshakeOptions: CommandOptions = { ...options };
  if (typeof options.connectTimeoutMS === 'number') {
    // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
    handshakeOptions.socketTimeoutMS = options.connectTimeoutMS;
  }

  const start = new Date().getTime();
  const response = await conn.commandAsync(ns('admin.$cmd'), handshakeDoc, handshakeOptions);

  if (!('isWritablePrimary' in response)) {
    // Provide hello-style response document.
    response.isWritablePrimary = response[LEGACY_HELLO_COMMAND];
  }

  if (response.helloOk) {
    conn.helloOk = true;
  }

  const supportedServerErr = checkSupportedServer(response, options);
  if (supportedServerErr) {
    throw supportedServerErr;
  }

  if (options.loadBalanced) {
    if (!response.serviceId) {
      throw new MongoCompatibilityError(
        'Driver attempted to initialize in load balancing mode, ' +
          'but the server does not support this mode.'
      );
    }
  }

  // NOTE: This is metadata attached to the connection while porting away from
  //       handshake being done in the `Server` class. Likely, it should be
  //       relocated, or at very least restructured.
  conn.hello = response;
  conn.lastHelloMS = new Date().getTime() - start;

  if (!response.arbiterOnly && credentials) {
    // store the response on auth context
    authContext.response = response;

    const resolvedCredentials = credentials.resolveAuthMechanism(response);
    const provider = AUTH_PROVIDERS.get(resolvedCredentials.mechanism);
    if (!provider) {
      throw new MongoInvalidArgumentError(
        `No AuthProvider for ${resolvedCredentials.mechanism} defined.`
      );
    }

    try {
      await provider.auth(authContext);
    } catch (error) {
      if (error instanceof MongoError) {
        error.addErrorLabel(MongoErrorLabel.HandshakeError);
        if (needsRetryableWriteLabel(error, response.maxWireVersion)) {
          error.addErrorLabel(MongoErrorLabel.RetryableWriteError);
        }
      }
      throw error;
    }
  }
}

export interface HandshakeDocument extends Document {
  /**
   * @deprecated Use hello instead
   */
  ismaster?: boolean;
  hello?: boolean;
  helloOk?: boolean;
  client: ClientMetadata;
  compression: string[];
  saslSupportedMechs?: string;
  loadBalanced?: boolean;
}

/**
 * @internal
 *
 * This function is only exposed for testing purposes.
 */
export async function prepareHandshakeDocument(
  authContext: AuthContext
): Promise<HandshakeDocument> {
  const options = authContext.options;
  const compressors = options.compressors ? options.compressors : [];
  const { serverApi } = authContext.connection;

  const handshakeDoc: HandshakeDocument = {
    [serverApi?.version ? 'hello' : LEGACY_HELLO_COMMAND]: 1,
    helloOk: true,
    client: options.metadata,
    compression: compressors
  };

  if (options.loadBalanced === true) {
    handshakeDoc.loadBalanced = true;
  }

  const credentials = authContext.credentials;
  if (credentials) {
    if (credentials.mechanism === AuthMechanism.MONGODB_DEFAULT && credentials.username) {
      handshakeDoc.saslSupportedMechs = `${credentials.source}.${credentials.username}`;

      const provider = AUTH_PROVIDERS.get(AuthMechanism.MONGODB_SCRAM_SHA256);
      if (!provider) {
        // This auth mechanism is always present.
        throw new MongoInvalidArgumentError(
          `No AuthProvider for ${AuthMechanism.MONGODB_SCRAM_SHA256} defined.`
        );
      }
      return provider.prepare(handshakeDoc, authContext);
    }
    const provider = AUTH_PROVIDERS.get(credentials.mechanism);
    if (!provider) {
      throw new MongoInvalidArgumentError(`No AuthProvider for ${credentials.mechanism} defined.`);
    }
    return provider.prepare(handshakeDoc, authContext);
  }
  return handshakeDoc;
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
  if (!hostAddress) throw new MongoInvalidArgumentError('Option "hostAddress" is required');

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
    // TODO(NODE-3483)
    throw new MongoRuntimeError(`Unexpected HostAddress ${JSON.stringify(hostAddress)}`);
  }
}

type MakeConnectionOptions = ConnectionOptions & { existingSocket?: Stream };

function parseSslOptions(options: MakeConnectionOptions): TLSConnectionOpts {
  const result: TLSConnectionOpts = parseConnectOptions(options);
  // Merge in valid SSL options
  for (const name of LEGAL_TLS_SOCKET_OPTIONS) {
    if (options[name] != null) {
      (result as Document)[name] = options[name];
    }
  }

  if (options.existingSocket) {
    result.socket = options.existingSocket;
  }

  // Set default sni servername to be the same as host
  if (result.servername == null && result.host && !net.isIP(result.host)) {
    result.servername = result.host;
  }

  return result;
}

const SOCKET_ERROR_EVENT_LIST = ['error', 'close', 'timeout', 'parseError'] as const;
type ErrorHandlerEventName = (typeof SOCKET_ERROR_EVENT_LIST)[number] | 'cancel';
const SOCKET_ERROR_EVENTS = new Set(SOCKET_ERROR_EVENT_LIST);

function makeConnection(options: MakeConnectionOptions, _callback: Callback<Stream>) {
  const useTLS = options.tls ?? false;
  const keepAlive = options.keepAlive ?? true;
  const socketTimeoutMS = options.socketTimeoutMS ?? Reflect.get(options, 'socketTimeout') ?? 0;
  const noDelay = options.noDelay ?? true;
  const connectTimeoutMS = options.connectTimeoutMS ?? 30000;
  const rejectUnauthorized = options.rejectUnauthorized ?? true;
  const keepAliveInitialDelay =
    ((options.keepAliveInitialDelay ?? 120000) > socketTimeoutMS
      ? Math.round(socketTimeoutMS / 2)
      : options.keepAliveInitialDelay) ?? 120000;
  const existingSocket = options.existingSocket;

  let socket: Stream;
  const callback: Callback<Stream> = function (err, ret) {
    if (err && socket) {
      socket.destroy();
    }

    _callback(err, ret);
  };

  if (options.proxyHost != null) {
    // Currently, only Socks5 is supported.
    return makeSocks5Connection(
      {
        ...options,
        connectTimeoutMS // Should always be present for Socks5
      },
      callback
    );
  }

  if (useTLS) {
    const tlsSocket = tls.connect(parseSslOptions(options));
    if (typeof tlsSocket.disableRenegotiation === 'function') {
      tlsSocket.disableRenegotiation();
    }
    socket = tlsSocket;
  } else if (existingSocket) {
    // In the TLS case, parseSslOptions() sets options.socket to existingSocket,
    // so we only need to handle the non-TLS case here (where existingSocket
    // gives us all we need out of the box).
    socket = existingSocket;
  } else {
    socket = net.createConnection(parseConnectOptions(options));
  }

  socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
  socket.setTimeout(connectTimeoutMS);
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

    socket.setTimeout(0);
    callback(undefined, socket);
  }

  SOCKET_ERROR_EVENTS.forEach(event => socket.once(event, errorHandler(event)));
  if (options.cancellationToken) {
    cancellationHandler = errorHandler('cancel');
    options.cancellationToken.once('cancel', cancellationHandler);
  }

  if (existingSocket) {
    process.nextTick(connectHandler);
  } else {
    socket.once(connectEvent, connectHandler);
  }
}

function makeSocks5Connection(options: MakeConnectionOptions, callback: Callback<Stream>) {
  const hostAddress = HostAddress.fromHostPort(
    options.proxyHost ?? '', // proxyHost is guaranteed to set here
    options.proxyPort ?? 1080
  );

  // First, connect to the proxy server itself:
  makeConnection(
    {
      ...options,
      hostAddress,
      tls: false,
      proxyHost: undefined
    },
    (err, rawSocket) => {
      if (err) {
        return callback(err);
      }

      const destination = parseConnectOptions(options) as net.TcpNetConnectOpts;
      if (typeof destination.host !== 'string' || typeof destination.port !== 'number') {
        return callback(
          new MongoInvalidArgumentError('Can only make Socks5 connections to TCP hosts')
        );
      }

      // Then, establish the Socks5 proxy connection:
      SocksClient.createConnection({
        existing_socket: rawSocket,
        timeout: options.connectTimeoutMS,
        command: 'connect',
        destination: {
          host: destination.host,
          port: destination.port
        },
        proxy: {
          // host and port are ignored because we pass existing_socket
          host: 'iLoveJavaScript',
          port: 0,
          type: 5,
          userId: options.proxyUsername || undefined,
          password: options.proxyPassword || undefined
        }
      }).then(
        ({ socket }) => {
          // Finally, now treat the resulting duplex stream as the
          // socket over which we send and receive wire protocol messages:
          makeConnection(
            {
              ...options,
              existingSocket: socket,
              proxyHost: undefined
            },
            callback
          );
        },
        error => callback(connectionFailureError('error', error))
      );
    }
  );
}

function connectionFailureError(type: ErrorHandlerEventName, err: Error) {
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
