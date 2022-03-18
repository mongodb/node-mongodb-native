"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSessionSupport = exports.CryptoConnection = exports.Connection = void 0;
const bson_1 = require("../bson");
const constants_1 = require("../constants");
const error_1 = require("../error");
const mongo_types_1 = require("../mongo_types");
const read_preference_1 = require("../read_preference");
const sessions_1 = require("../sessions");
const utils_1 = require("../utils");
const command_monitoring_events_1 = require("./command_monitoring_events");
const commands_1 = require("./commands");
const message_stream_1 = require("./message_stream");
const stream_description_1 = require("./stream_description");
const shared_1 = require("./wire_protocol/shared");
/** @internal */
const kStream = Symbol('stream');
/** @internal */
const kQueue = Symbol('queue');
/** @internal */
const kMessageStream = Symbol('messageStream');
/** @internal */
const kGeneration = Symbol('generation');
/** @internal */
const kLastUseTime = Symbol('lastUseTime');
/** @internal */
const kClusterTime = Symbol('clusterTime');
/** @internal */
const kDescription = Symbol('description');
/** @internal */
const kHello = Symbol('hello');
/** @internal */
const kAutoEncrypter = Symbol('autoEncrypter');
/** @internal */
const kFullResult = Symbol('fullResult');
/** @internal */
class Connection extends mongo_types_1.TypedEventEmitter {
    constructor(stream, options) {
        var _a, _b;
        super();
        this.id = options.id;
        this.address = streamIdentifier(stream, options);
        this.socketTimeoutMS = (_a = options.socketTimeoutMS) !== null && _a !== void 0 ? _a : 0;
        this.monitorCommands = options.monitorCommands;
        this.serverApi = options.serverApi;
        this.closed = false;
        this.destroyed = false;
        this[kDescription] = new stream_description_1.StreamDescription(this.address, options);
        this[kGeneration] = options.generation;
        this[kLastUseTime] = (0, utils_1.now)();
        // setup parser stream and message handling
        this[kQueue] = new Map();
        this[kMessageStream] = new message_stream_1.MessageStream({
            ...options,
            maxBsonMessageSize: (_b = this.hello) === null || _b === void 0 ? void 0 : _b.maxBsonMessageSize
        });
        this[kMessageStream].on('message', messageHandler(this));
        this[kStream] = stream;
        stream.on('error', () => {
            /* ignore errors, listen to `close` instead */
        });
        this[kMessageStream].on('error', error => this.handleIssue({ destroy: error }));
        stream.on('close', () => this.handleIssue({ isClose: true }));
        stream.on('timeout', () => this.handleIssue({ isTimeout: true, destroy: true }));
        // hook the message stream up to the passed in stream
        stream.pipe(this[kMessageStream]);
        this[kMessageStream].pipe(stream);
    }
    get description() {
        return this[kDescription];
    }
    get hello() {
        return this[kHello];
    }
    // the `connect` method stores the result of the handshake hello on the connection
    set hello(response) {
        this[kDescription].receiveResponse(response);
        this[kDescription] = Object.freeze(this[kDescription]);
        // TODO: remove this, and only use the `StreamDescription` in the future
        this[kHello] = response;
    }
    get serviceId() {
        var _a;
        return (_a = this.hello) === null || _a === void 0 ? void 0 : _a.serviceId;
    }
    get loadBalanced() {
        return this.description.loadBalanced;
    }
    get generation() {
        return this[kGeneration] || 0;
    }
    set generation(generation) {
        this[kGeneration] = generation;
    }
    get idleTime() {
        return (0, utils_1.calculateDurationInMs)(this[kLastUseTime]);
    }
    get clusterTime() {
        return this[kClusterTime];
    }
    get stream() {
        return this[kStream];
    }
    markAvailable() {
        this[kLastUseTime] = (0, utils_1.now)();
    }
    handleIssue(issue) {
        if (this.closed) {
            return;
        }
        if (issue.destroy) {
            this[kStream].destroy(typeof issue.destroy === 'boolean' ? undefined : issue.destroy);
        }
        this.closed = true;
        for (const [, op] of this[kQueue]) {
            if (issue.isTimeout) {
                op.cb(new error_1.MongoNetworkTimeoutError(`connection ${this.id} to ${this.address} timed out`, {
                    beforeHandshake: this.hello == null
                }));
            }
            else if (issue.isClose) {
                op.cb(new error_1.MongoNetworkError(`connection ${this.id} to ${this.address} closed`));
            }
            else {
                op.cb(typeof issue.destroy === 'boolean' ? undefined : issue.destroy);
            }
        }
        this[kQueue].clear();
        this.emit(Connection.CLOSE);
    }
    destroy(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = { force: false };
        }
        this.removeAllListeners(Connection.PINNED);
        this.removeAllListeners(Connection.UNPINNED);
        options = Object.assign({ force: false }, options);
        if (this[kStream] == null || this.destroyed) {
            this.destroyed = true;
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
        if (options.force) {
            this[kStream].destroy();
            this.destroyed = true;
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
        this[kStream].end(() => {
            this.destroyed = true;
            if (typeof callback === 'function') {
                callback();
            }
        });
    }
    /** @internal */
    command(ns, cmd, options, callback) {
        if (!(ns instanceof utils_1.MongoDBNamespace)) {
            // TODO(NODE-3483): Replace this with a MongoCommandError
            throw new error_1.MongoRuntimeError('Must provide a MongoDBNamespace instance');
        }
        const readPreference = (0, shared_1.getReadPreference)(cmd, options);
        const shouldUseOpMsg = supportsOpMsg(this);
        const session = options === null || options === void 0 ? void 0 : options.session;
        let clusterTime = this.clusterTime;
        let finalCmd = Object.assign({}, cmd);
        if (this.serverApi) {
            const { version, strict, deprecationErrors } = this.serverApi;
            finalCmd.apiVersion = version;
            if (strict != null)
                finalCmd.apiStrict = strict;
            if (deprecationErrors != null)
                finalCmd.apiDeprecationErrors = deprecationErrors;
        }
        if (hasSessionSupport(this) && session) {
            if (session.clusterTime &&
                clusterTime &&
                session.clusterTime.clusterTime.greaterThan(clusterTime.clusterTime)) {
                clusterTime = session.clusterTime;
            }
            const err = (0, sessions_1.applySession)(session, finalCmd, options);
            if (err) {
                return callback(err);
            }
        }
        // if we have a known cluster time, gossip it
        if (clusterTime) {
            finalCmd.$clusterTime = clusterTime;
        }
        if ((0, shared_1.isSharded)(this) && !shouldUseOpMsg && readPreference && readPreference.mode !== 'primary') {
            finalCmd = {
                $query: finalCmd,
                $readPreference: readPreference.toJSON()
            };
        }
        const commandOptions = Object.assign({
            command: true,
            numberToSkip: 0,
            numberToReturn: -1,
            checkKeys: false,
            // This value is not overridable
            secondaryOk: readPreference.secondaryOk()
        }, options);
        const cmdNs = `${ns.db}.$cmd`;
        const message = shouldUseOpMsg
            ? new commands_1.Msg(cmdNs, finalCmd, commandOptions)
            : new commands_1.Query(cmdNs, finalCmd, commandOptions);
        try {
            write(this, message, commandOptions, callback);
        }
        catch (err) {
            callback(err);
        }
    }
    /** @internal */
    query(ns, cmd, options, callback) {
        var _a;
        const isExplain = cmd.$explain != null;
        const readPreference = (_a = options.readPreference) !== null && _a !== void 0 ? _a : read_preference_1.ReadPreference.primary;
        const batchSize = options.batchSize || 0;
        const limit = options.limit;
        const numberToSkip = options.skip || 0;
        let numberToReturn = 0;
        if (limit &&
            (limit < 0 || (limit !== 0 && limit < batchSize) || (limit > 0 && batchSize === 0))) {
            numberToReturn = limit;
        }
        else {
            numberToReturn = batchSize;
        }
        if (isExplain) {
            // nToReturn must be 0 (match all) or negative (match N and close cursor)
            // nToReturn > 0 will give explain results equivalent to limit(0)
            numberToReturn = -Math.abs(limit || 0);
        }
        const queryOptions = {
            numberToSkip,
            numberToReturn,
            pre32Limit: typeof limit === 'number' ? limit : undefined,
            checkKeys: false,
            secondaryOk: readPreference.secondaryOk()
        };
        if (options.projection) {
            queryOptions.returnFieldSelector = options.projection;
        }
        const query = new commands_1.Query(ns.toString(), cmd, queryOptions);
        if (typeof options.tailable === 'boolean') {
            query.tailable = options.tailable;
        }
        if (typeof options.oplogReplay === 'boolean') {
            query.oplogReplay = options.oplogReplay;
        }
        if (typeof options.timeout === 'boolean') {
            query.noCursorTimeout = !options.timeout;
        }
        else if (typeof options.noCursorTimeout === 'boolean') {
            query.noCursorTimeout = options.noCursorTimeout;
        }
        if (typeof options.awaitData === 'boolean') {
            query.awaitData = options.awaitData;
        }
        if (typeof options.partial === 'boolean') {
            query.partial = options.partial;
        }
        write(this, query, { [kFullResult]: true, ...(0, bson_1.pluckBSONSerializeOptions)(options) }, (err, result) => {
            if (err || !result)
                return callback(err, result);
            if (isExplain && result.documents && result.documents[0]) {
                return callback(undefined, result.documents[0]);
            }
            callback(undefined, result);
        });
    }
    /** @internal */
    getMore(ns, cursorId, options, callback) {
        const fullResult = !!options[kFullResult];
        const wireVersion = (0, utils_1.maxWireVersion)(this);
        if (!cursorId) {
            // TODO(NODE-3483): Replace this with a MongoCommandError
            callback(new error_1.MongoRuntimeError('Invalid internal cursor state, no known cursor id'));
            return;
        }
        if (wireVersion < 4) {
            const getMoreOp = new commands_1.GetMore(ns.toString(), cursorId, { numberToReturn: options.batchSize });
            const queryOptions = (0, shared_1.applyCommonQueryOptions)({}, Object.assign(options, { ...(0, bson_1.pluckBSONSerializeOptions)(options) }));
            queryOptions[kFullResult] = true;
            queryOptions.command = true;
            write(this, getMoreOp, queryOptions, (err, response) => {
                if (fullResult)
                    return callback(err, response);
                if (err)
                    return callback(err);
                callback(undefined, { cursor: { id: response.cursorId, nextBatch: response.documents } });
            });
            return;
        }
        const getMoreCmd = {
            getMore: cursorId,
            collection: ns.collection
        };
        if (typeof options.batchSize === 'number') {
            getMoreCmd.batchSize = Math.abs(options.batchSize);
        }
        if (typeof options.maxAwaitTimeMS === 'number') {
            getMoreCmd.maxTimeMS = options.maxAwaitTimeMS;
        }
        const commandOptions = Object.assign({
            returnFieldSelector: null,
            documentsReturnedIn: 'nextBatch'
        }, options);
        this.command(ns, getMoreCmd, commandOptions, callback);
    }
    /** @internal */
    killCursors(ns, cursorIds, options, callback) {
        if (!cursorIds || !Array.isArray(cursorIds)) {
            // TODO(NODE-3483): Replace this with a MongoCommandError
            throw new error_1.MongoRuntimeError(`Invalid list of cursor ids provided: ${cursorIds}`);
        }
        if ((0, utils_1.maxWireVersion)(this) < 4) {
            try {
                write(this, new commands_1.KillCursor(ns.toString(), cursorIds), { noResponse: true, ...options }, callback);
            }
            catch (err) {
                callback(err);
            }
            return;
        }
        this.command(ns, { killCursors: ns.collection, cursors: cursorIds }, { [kFullResult]: true, ...options }, (err, response) => {
            if (err || !response)
                return callback(err);
            if (response.cursorNotFound) {
                return callback(new error_1.MongoNetworkError('cursor killed or timed out'), null);
            }
            if (!Array.isArray(response.documents) || response.documents.length === 0) {
                return callback(
                // TODO(NODE-3483)
                new error_1.MongoRuntimeError(`invalid killCursors result returned for cursor id ${cursorIds[0]}`));
            }
            callback(undefined, response.documents[0]);
        });
    }
}
exports.Connection = Connection;
/** @event */
Connection.COMMAND_STARTED = constants_1.COMMAND_STARTED;
/** @event */
Connection.COMMAND_SUCCEEDED = constants_1.COMMAND_SUCCEEDED;
/** @event */
Connection.COMMAND_FAILED = constants_1.COMMAND_FAILED;
/** @event */
Connection.CLUSTER_TIME_RECEIVED = constants_1.CLUSTER_TIME_RECEIVED;
/** @event */
Connection.CLOSE = constants_1.CLOSE;
/** @event */
Connection.MESSAGE = constants_1.MESSAGE;
/** @event */
Connection.PINNED = constants_1.PINNED;
/** @event */
Connection.UNPINNED = constants_1.UNPINNED;
/** @internal */
class CryptoConnection extends Connection {
    constructor(stream, options) {
        super(stream, options);
        this[kAutoEncrypter] = options.autoEncrypter;
    }
    /** @internal @override */
    command(ns, cmd, options, callback) {
        const autoEncrypter = this[kAutoEncrypter];
        if (!autoEncrypter) {
            return callback(new error_1.MongoMissingDependencyError('No AutoEncrypter available for encryption'));
        }
        const serverWireVersion = (0, utils_1.maxWireVersion)(this);
        if (serverWireVersion === 0) {
            // This means the initial handshake hasn't happened yet
            return super.command(ns, cmd, options, callback);
        }
        if (serverWireVersion < 8) {
            callback(new error_1.MongoCompatibilityError('Auto-encryption requires a minimum MongoDB version of 4.2'));
            return;
        }
        autoEncrypter.encrypt(ns.toString(), cmd, options, (err, encrypted) => {
            if (err || encrypted == null) {
                callback(err, null);
                return;
            }
            super.command(ns, encrypted, options, (err, response) => {
                if (err || response == null) {
                    callback(err, response);
                    return;
                }
                autoEncrypter.decrypt(response, options, callback);
            });
        });
    }
}
exports.CryptoConnection = CryptoConnection;
/** @internal */
function hasSessionSupport(conn) {
    const description = conn.description;
    return description.logicalSessionTimeoutMinutes != null || !!description.loadBalanced;
}
exports.hasSessionSupport = hasSessionSupport;
function supportsOpMsg(conn) {
    const description = conn.description;
    if (description == null) {
        return false;
    }
    return (0, utils_1.maxWireVersion)(conn) >= 6 && !description.__nodejs_mock_server__;
}
function messageHandler(conn) {
    return function messageHandler(message) {
        // always emit the message, in case we are streaming
        conn.emit('message', message);
        const operationDescription = conn[kQueue].get(message.responseTo);
        if (!operationDescription) {
            return;
        }
        const callback = operationDescription.cb;
        // SERVER-45775: For exhaust responses we should be able to use the same requestId to
        // track response, however the server currently synthetically produces remote requests
        // making the `responseTo` change on each response
        conn[kQueue].delete(message.responseTo);
        if ('moreToCome' in message && message.moreToCome) {
            // requeue the callback for next synthetic request
            conn[kQueue].set(message.requestId, operationDescription);
        }
        else if (operationDescription.socketTimeoutOverride) {
            conn[kStream].setTimeout(conn.socketTimeoutMS);
        }
        try {
            // Pass in the entire description because it has BSON parsing options
            message.parse(operationDescription);
        }
        catch (err) {
            // If this error is generated by our own code, it will already have the correct class applied
            // if it is not, then it is coming from a catastrophic data parse failure or the BSON library
            // in either case, it should not be wrapped
            callback(err);
            return;
        }
        if (message.documents[0]) {
            const document = message.documents[0];
            const session = operationDescription.session;
            if (session) {
                (0, sessions_1.updateSessionFromResponse)(session, document);
            }
            if (document.$clusterTime) {
                conn[kClusterTime] = document.$clusterTime;
                conn.emit(Connection.CLUSTER_TIME_RECEIVED, document.$clusterTime);
            }
            if (operationDescription.command) {
                if (document.writeConcernError) {
                    callback(new error_1.MongoWriteConcernError(document.writeConcernError, document));
                    return;
                }
                if (document.ok === 0 || document.$err || document.errmsg || document.code) {
                    callback(new error_1.MongoServerError(document));
                    return;
                }
            }
            else {
                // Pre 3.2 support
                if (document.ok === 0 || document.$err || document.errmsg) {
                    callback(new error_1.MongoServerError(document));
                    return;
                }
            }
        }
        callback(undefined, operationDescription.fullResult ? message : message.documents[0]);
    };
}
function streamIdentifier(stream, options) {
    if (options.proxyHost) {
        // If proxy options are specified, the properties of `stream` itself
        // will not accurately reflect what endpoint this is connected to.
        return options.hostAddress.toString();
    }
    if (typeof stream.address === 'function') {
        return `${stream.remoteAddress}:${stream.remotePort}`;
    }
    return (0, utils_1.uuidV4)().toString('hex');
}
function write(conn, command, options, callback) {
    if (typeof options === 'function') {
        callback = options;
    }
    options = options !== null && options !== void 0 ? options : {};
    const operationDescription = {
        requestId: command.requestId,
        cb: callback,
        session: options.session,
        fullResult: !!options[kFullResult],
        noResponse: typeof options.noResponse === 'boolean' ? options.noResponse : false,
        documentsReturnedIn: options.documentsReturnedIn,
        command: !!options.command,
        // for BSON parsing
        promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
        promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
        promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
        bsonRegExp: typeof options.bsonRegExp === 'boolean' ? options.bsonRegExp : false,
        enableUtf8Validation: typeof options.enableUtf8Validation === 'boolean' ? options.enableUtf8Validation : true,
        raw: typeof options.raw === 'boolean' ? options.raw : false,
        started: 0
    };
    if (conn[kDescription] && conn[kDescription].compressor) {
        operationDescription.agreedCompressor = conn[kDescription].compressor;
        if (conn[kDescription].zlibCompressionLevel) {
            operationDescription.zlibCompressionLevel = conn[kDescription].zlibCompressionLevel;
        }
    }
    if (typeof options.socketTimeoutMS === 'number') {
        operationDescription.socketTimeoutOverride = true;
        conn[kStream].setTimeout(options.socketTimeoutMS);
    }
    // if command monitoring is enabled we need to modify the callback here
    if (conn.monitorCommands) {
        conn.emit(Connection.COMMAND_STARTED, new command_monitoring_events_1.CommandStartedEvent(conn, command));
        operationDescription.started = (0, utils_1.now)();
        operationDescription.cb = (err, reply) => {
            if (err) {
                conn.emit(Connection.COMMAND_FAILED, new command_monitoring_events_1.CommandFailedEvent(conn, command, err, operationDescription.started));
            }
            else {
                if (reply && (reply.ok === 0 || reply.$err)) {
                    conn.emit(Connection.COMMAND_FAILED, new command_monitoring_events_1.CommandFailedEvent(conn, command, reply, operationDescription.started));
                }
                else {
                    conn.emit(Connection.COMMAND_SUCCEEDED, new command_monitoring_events_1.CommandSucceededEvent(conn, command, reply, operationDescription.started));
                }
            }
            if (typeof callback === 'function') {
                callback(err, reply);
            }
        };
    }
    if (!operationDescription.noResponse) {
        conn[kQueue].set(operationDescription.requestId, operationDescription);
    }
    try {
        conn[kMessageStream].writeCommand(command, operationDescription);
    }
    catch (e) {
        if (!operationDescription.noResponse) {
            conn[kQueue].delete(operationDescription.requestId);
            operationDescription.cb(e);
            return;
        }
    }
    if (operationDescription.noResponse) {
        operationDescription.cb();
    }
}
//# sourceMappingURL=connection.js.map