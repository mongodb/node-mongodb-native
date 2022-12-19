"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGAL_TCP_SOCKET_OPTIONS = exports.LEGAL_TLS_SOCKET_OPTIONS = exports.prepareHandshakeDocument = exports.connect = void 0;
const net = require("net");
const socks_1 = require("socks");
const tls = require("tls");
const bson_1 = require("../bson");
const constants_1 = require("../constants");
const error_1 = require("../error");
const utils_1 = require("../utils");
const auth_provider_1 = require("./auth/auth_provider");
const gssapi_1 = require("./auth/gssapi");
const mongocr_1 = require("./auth/mongocr");
const mongodb_aws_1 = require("./auth/mongodb_aws");
const plain_1 = require("./auth/plain");
const providers_1 = require("./auth/providers");
const scram_1 = require("./auth/scram");
const x509_1 = require("./auth/x509");
const connection_1 = require("./connection");
const constants_2 = require("./wire_protocol/constants");
const AUTH_PROVIDERS = new Map([
    [providers_1.AuthMechanism.MONGODB_AWS, new mongodb_aws_1.MongoDBAWS()],
    [providers_1.AuthMechanism.MONGODB_CR, new mongocr_1.MongoCR()],
    [providers_1.AuthMechanism.MONGODB_GSSAPI, new gssapi_1.GSSAPI()],
    [providers_1.AuthMechanism.MONGODB_PLAIN, new plain_1.Plain()],
    [providers_1.AuthMechanism.MONGODB_SCRAM_SHA1, new scram_1.ScramSHA1()],
    [providers_1.AuthMechanism.MONGODB_SCRAM_SHA256, new scram_1.ScramSHA256()],
    [providers_1.AuthMechanism.MONGODB_X509, new x509_1.X509()]
]);
function connect(options, callback) {
    makeConnection({ ...options, existingSocket: undefined }, (err, socket) => {
        var _a;
        if (err || !socket) {
            return callback(err);
        }
        let ConnectionType = (_a = options.connectionType) !== null && _a !== void 0 ? _a : connection_1.Connection;
        if (options.autoEncrypter) {
            ConnectionType = connection_1.CryptoConnection;
        }
        performInitialHandshake(new ConnectionType(socket, options), options, callback);
    });
}
exports.connect = connect;
function checkSupportedServer(hello, options) {
    var _a;
    const serverVersionHighEnough = hello &&
        (typeof hello.maxWireVersion === 'number' || hello.maxWireVersion instanceof bson_1.Int32) &&
        hello.maxWireVersion >= constants_2.MIN_SUPPORTED_WIRE_VERSION;
    const serverVersionLowEnough = hello &&
        (typeof hello.minWireVersion === 'number' || hello.minWireVersion instanceof bson_1.Int32) &&
        hello.minWireVersion <= constants_2.MAX_SUPPORTED_WIRE_VERSION;
    if (serverVersionHighEnough) {
        if (serverVersionLowEnough) {
            return null;
        }
        const message = `Server at ${options.hostAddress} reports minimum wire version ${JSON.stringify(hello.minWireVersion)}, but this version of the Node.js Driver requires at most ${constants_2.MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${constants_2.MAX_SUPPORTED_SERVER_VERSION})`;
        return new error_1.MongoCompatibilityError(message);
    }
    const message = `Server at ${options.hostAddress} reports maximum wire version ${(_a = JSON.stringify(hello.maxWireVersion)) !== null && _a !== void 0 ? _a : 0}, but this version of the Node.js Driver requires at least ${constants_2.MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${constants_2.MIN_SUPPORTED_SERVER_VERSION})`;
    return new error_1.MongoCompatibilityError(message);
}
function performInitialHandshake(conn, options, _callback) {
    const callback = function (err, ret) {
        if (err && conn) {
            conn.destroy({ force: false });
        }
        _callback(err, ret);
    };
    const credentials = options.credentials;
    if (credentials) {
        if (!(credentials.mechanism === providers_1.AuthMechanism.MONGODB_DEFAULT) &&
            !AUTH_PROVIDERS.get(credentials.mechanism)) {
            callback(new error_1.MongoInvalidArgumentError(`AuthMechanism '${credentials.mechanism}' not supported`));
            return;
        }
    }
    const authContext = new auth_provider_1.AuthContext(conn, credentials, options);
    prepareHandshakeDocument(authContext, (err, handshakeDoc) => {
        if (err || !handshakeDoc) {
            return callback(err);
        }
        const handshakeOptions = Object.assign({}, options);
        if (typeof options.connectTimeoutMS === 'number') {
            // The handshake technically is a monitoring check, so its socket timeout should be connectTimeoutMS
            handshakeOptions.socketTimeoutMS = options.connectTimeoutMS;
        }
        const start = new Date().getTime();
        conn.command((0, utils_1.ns)('admin.$cmd'), handshakeDoc, handshakeOptions, (err, response) => {
            if (err) {
                callback(err);
                return;
            }
            if ((response === null || response === void 0 ? void 0 : response.ok) === 0) {
                callback(new error_1.MongoServerError(response));
                return;
            }
            if (!('isWritablePrimary' in response)) {
                // Provide hello-style response document.
                response.isWritablePrimary = response[constants_1.LEGACY_HELLO_COMMAND];
            }
            if (response.helloOk) {
                conn.helloOk = true;
            }
            const supportedServerErr = checkSupportedServer(response, options);
            if (supportedServerErr) {
                callback(supportedServerErr);
                return;
            }
            if (options.loadBalanced) {
                if (!response.serviceId) {
                    return callback(new error_1.MongoCompatibilityError('Driver attempted to initialize in load balancing mode, ' +
                        'but the server does not support this mode.'));
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
                    return callback(new error_1.MongoInvalidArgumentError(`No AuthProvider for ${resolvedCredentials.mechanism} defined.`));
                }
                provider.auth(authContext, err => {
                    if (err) {
                        if (err instanceof error_1.MongoError) {
                            err.addErrorLabel(error_1.MongoErrorLabel.HandshakeError);
                            if ((0, error_1.needsRetryableWriteLabel)(err, response.maxWireVersion)) {
                                err.addErrorLabel(error_1.MongoErrorLabel.RetryableWriteError);
                            }
                        }
                        return callback(err);
                    }
                    callback(undefined, conn);
                });
                return;
            }
            callback(undefined, conn);
        });
    });
}
/**
 * @internal
 *
 * This function is only exposed for testing purposes.
 */
function prepareHandshakeDocument(authContext, callback) {
    const options = authContext.options;
    const compressors = options.compressors ? options.compressors : [];
    const { serverApi } = authContext.connection;
    const handshakeDoc = {
        [(serverApi === null || serverApi === void 0 ? void 0 : serverApi.version) ? 'hello' : constants_1.LEGACY_HELLO_COMMAND]: true,
        helloOk: true,
        client: options.metadata || (0, utils_1.makeClientMetadata)(options),
        compression: compressors
    };
    if (options.loadBalanced === true) {
        handshakeDoc.loadBalanced = true;
    }
    const credentials = authContext.credentials;
    if (credentials) {
        if (credentials.mechanism === providers_1.AuthMechanism.MONGODB_DEFAULT && credentials.username) {
            handshakeDoc.saslSupportedMechs = `${credentials.source}.${credentials.username}`;
            const provider = AUTH_PROVIDERS.get(providers_1.AuthMechanism.MONGODB_SCRAM_SHA256);
            if (!provider) {
                // This auth mechanism is always present.
                return callback(new error_1.MongoInvalidArgumentError(`No AuthProvider for ${providers_1.AuthMechanism.MONGODB_SCRAM_SHA256} defined.`));
            }
            return provider.prepare(handshakeDoc, authContext, callback);
        }
        const provider = AUTH_PROVIDERS.get(credentials.mechanism);
        if (!provider) {
            return callback(new error_1.MongoInvalidArgumentError(`No AuthProvider for ${credentials.mechanism} defined.`));
        }
        return provider.prepare(handshakeDoc, authContext, callback);
    }
    callback(undefined, handshakeDoc);
}
exports.prepareHandshakeDocument = prepareHandshakeDocument;
/** @public */
exports.LEGAL_TLS_SOCKET_OPTIONS = [
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
];
/** @public */
exports.LEGAL_TCP_SOCKET_OPTIONS = [
    'family',
    'hints',
    'localAddress',
    'localPort',
    'lookup'
];
function parseConnectOptions(options) {
    const hostAddress = options.hostAddress;
    if (!hostAddress)
        throw new error_1.MongoInvalidArgumentError('Option "hostAddress" is required');
    const result = {};
    for (const name of exports.LEGAL_TCP_SOCKET_OPTIONS) {
        if (options[name] != null) {
            result[name] = options[name];
        }
    }
    if (typeof hostAddress.socketPath === 'string') {
        result.path = hostAddress.socketPath;
        return result;
    }
    else if (typeof hostAddress.host === 'string') {
        result.host = hostAddress.host;
        result.port = hostAddress.port;
        return result;
    }
    else {
        // This should never happen since we set up HostAddresses
        // But if we don't throw here the socket could hang until timeout
        // TODO(NODE-3483)
        throw new error_1.MongoRuntimeError(`Unexpected HostAddress ${JSON.stringify(hostAddress)}`);
    }
}
function parseSslOptions(options) {
    const result = parseConnectOptions(options);
    // Merge in valid SSL options
    for (const name of exports.LEGAL_TLS_SOCKET_OPTIONS) {
        if (options[name] != null) {
            result[name] = options[name];
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
const SOCKET_ERROR_EVENT_LIST = ['error', 'close', 'timeout', 'parseError'];
const SOCKET_ERROR_EVENTS = new Set(SOCKET_ERROR_EVENT_LIST);
function makeConnection(options, _callback) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const useTLS = (_a = options.tls) !== null && _a !== void 0 ? _a : false;
    const keepAlive = (_b = options.keepAlive) !== null && _b !== void 0 ? _b : true;
    const socketTimeoutMS = (_d = (_c = options.socketTimeoutMS) !== null && _c !== void 0 ? _c : Reflect.get(options, 'socketTimeout')) !== null && _d !== void 0 ? _d : 0;
    const noDelay = (_e = options.noDelay) !== null && _e !== void 0 ? _e : true;
    const connectTimeoutMS = (_f = options.connectTimeoutMS) !== null && _f !== void 0 ? _f : 30000;
    const rejectUnauthorized = (_g = options.rejectUnauthorized) !== null && _g !== void 0 ? _g : true;
    const keepAliveInitialDelay = (_j = (((_h = options.keepAliveInitialDelay) !== null && _h !== void 0 ? _h : 120000) > socketTimeoutMS
        ? Math.round(socketTimeoutMS / 2)
        : options.keepAliveInitialDelay)) !== null && _j !== void 0 ? _j : 120000;
    const existingSocket = options.existingSocket;
    let socket;
    const callback = function (err, ret) {
        if (err && socket) {
            socket.destroy();
        }
        _callback(err, ret);
    };
    if (options.proxyHost != null) {
        // Currently, only Socks5 is supported.
        return makeSocks5Connection({
            ...options,
            connectTimeoutMS // Should always be present for Socks5
        }, callback);
    }
    if (useTLS) {
        const tlsSocket = tls.connect(parseSslOptions(options));
        if (typeof tlsSocket.disableRenegotiation === 'function') {
            tlsSocket.disableRenegotiation();
        }
        socket = tlsSocket;
    }
    else if (existingSocket) {
        // In the TLS case, parseSslOptions() sets options.socket to existingSocket,
        // so we only need to handle the non-TLS case here (where existingSocket
        // gives us all we need out of the box).
        socket = existingSocket;
    }
    else {
        socket = net.createConnection(parseConnectOptions(options));
    }
    socket.setKeepAlive(keepAlive, keepAliveInitialDelay);
    socket.setTimeout(connectTimeoutMS);
    socket.setNoDelay(noDelay);
    const connectEvent = useTLS ? 'secureConnect' : 'connect';
    let cancellationHandler;
    function errorHandler(eventName) {
        return (err) => {
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
    if (existingSocket) {
        process.nextTick(connectHandler);
    }
    else {
        socket.once(connectEvent, connectHandler);
    }
}
function makeSocks5Connection(options, callback) {
    var _a, _b;
    const hostAddress = utils_1.HostAddress.fromHostPort((_a = options.proxyHost) !== null && _a !== void 0 ? _a : '', // proxyHost is guaranteed to set here
    (_b = options.proxyPort) !== null && _b !== void 0 ? _b : 1080);
    // First, connect to the proxy server itself:
    makeConnection({
        ...options,
        hostAddress,
        tls: false,
        proxyHost: undefined
    }, (err, rawSocket) => {
        if (err) {
            return callback(err);
        }
        const destination = parseConnectOptions(options);
        if (typeof destination.host !== 'string' || typeof destination.port !== 'number') {
            return callback(new error_1.MongoInvalidArgumentError('Can only make Socks5 connections to TCP hosts'));
        }
        // Then, establish the Socks5 proxy connection:
        socks_1.SocksClient.createConnection({
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
        }).then(({ socket }) => {
            // Finally, now treat the resulting duplex stream as the
            // socket over which we send and receive wire protocol messages:
            makeConnection({
                ...options,
                existingSocket: socket,
                proxyHost: undefined
            }, callback);
        }, error => callback(connectionFailureError('error', error)));
    });
}
function connectionFailureError(type, err) {
    switch (type) {
        case 'error':
            return new error_1.MongoNetworkError(err);
        case 'timeout':
            return new error_1.MongoNetworkTimeoutError('connection timed out');
        case 'close':
            return new error_1.MongoNetworkError('connection closed');
        case 'cancel':
            return new error_1.MongoNetworkError('connection establishment was cancelled');
        default:
            return new error_1.MongoNetworkError('unknown network error');
    }
}
//# sourceMappingURL=connect.js.map