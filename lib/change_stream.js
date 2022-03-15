"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeStreamCursor = exports.ChangeStream = void 0;
const Denque = require("denque");
const collection_1 = require("./collection");
const abstract_cursor_1 = require("./cursor/abstract_cursor");
const db_1 = require("./db");
const error_1 = require("./error");
const mongo_client_1 = require("./mongo_client");
const mongo_types_1 = require("./mongo_types");
const aggregate_1 = require("./operations/aggregate");
const execute_operation_1 = require("./operations/execute_operation");
const utils_1 = require("./utils");
/** @internal */
const kResumeQueue = Symbol('resumeQueue');
/** @internal */
const kCursorStream = Symbol('cursorStream');
/** @internal */
const kClosed = Symbol('closed');
/** @internal */
const kMode = Symbol('mode');
const CHANGE_STREAM_OPTIONS = ['resumeAfter', 'startAfter', 'startAtOperationTime', 'fullDocument'];
const CURSOR_OPTIONS = ['batchSize', 'maxAwaitTimeMS', 'collation', 'readPreference'].concat(CHANGE_STREAM_OPTIONS);
const CHANGE_DOMAIN_TYPES = {
    COLLECTION: Symbol('Collection'),
    DATABASE: Symbol('Database'),
    CLUSTER: Symbol('Cluster')
};
const NO_RESUME_TOKEN_ERROR = 'A change stream document has been received that lacks a resume token (_id).';
const NO_CURSOR_ERROR = 'ChangeStream has no cursor';
const CHANGESTREAM_CLOSED_ERROR = 'ChangeStream is closed';
/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @public
 */
class ChangeStream extends mongo_types_1.TypedEventEmitter {
    /**
     * @internal
     *
     * @param parent - The parent object that created this change stream
     * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
     */
    constructor(parent, pipeline = [], options = {}) {
        super();
        this.pipeline = pipeline;
        this.options = options;
        if (parent instanceof collection_1.Collection) {
            this.type = CHANGE_DOMAIN_TYPES.COLLECTION;
        }
        else if (parent instanceof db_1.Db) {
            this.type = CHANGE_DOMAIN_TYPES.DATABASE;
        }
        else if (parent instanceof mongo_client_1.MongoClient) {
            this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
        }
        else {
            throw new error_1.MongoChangeStreamError('Parent provided to ChangeStream constructor must be an instance of Collection, Db, or MongoClient');
        }
        this.parent = parent;
        this.namespace = parent.s.namespace;
        if (!this.options.readPreference && parent.readPreference) {
            this.options.readPreference = parent.readPreference;
        }
        this[kResumeQueue] = new Denque();
        // Create contained Change Stream cursor
        this.cursor = createChangeStreamCursor(this, options);
        this[kClosed] = false;
        this[kMode] = false;
        // Listen for any `change` listeners being added to ChangeStream
        this.on('newListener', eventName => {
            if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
                streamEvents(this, this.cursor);
            }
        });
        this.on('removeListener', eventName => {
            var _a;
            if (eventName === 'change' && this.listenerCount('change') === 0 && this.cursor) {
                (_a = this[kCursorStream]) === null || _a === void 0 ? void 0 : _a.removeAllListeners('data');
            }
        });
    }
    /** @internal */
    get cursorStream() {
        return this[kCursorStream];
    }
    /** The cached resume token that is used to resume after the most recently returned change. */
    get resumeToken() {
        var _a;
        return (_a = this.cursor) === null || _a === void 0 ? void 0 : _a.resumeToken;
    }
    hasNext(callback) {
        setIsIterator(this);
        return (0, utils_1.maybePromise)(callback, cb => {
            getCursor(this, (err, cursor) => {
                if (err || !cursor)
                    return cb(err); // failed to resume, raise an error
                cursor.hasNext(cb);
            });
        });
    }
    next(callback) {
        setIsIterator(this);
        return (0, utils_1.maybePromise)(callback, cb => {
            getCursor(this, (err, cursor) => {
                if (err || !cursor)
                    return cb(err); // failed to resume, raise an error
                cursor.next((error, change) => {
                    if (error) {
                        this[kResumeQueue].push(() => this.next(cb));
                        processError(this, error, cb);
                        return;
                    }
                    processNewChange(this, change, cb);
                });
            });
        });
    }
    /** Is the cursor closed */
    get closed() {
        var _a, _b;
        return this[kClosed] || ((_b = (_a = this.cursor) === null || _a === void 0 ? void 0 : _a.closed) !== null && _b !== void 0 ? _b : false);
    }
    /** Close the Change Stream */
    close(callback) {
        this[kClosed] = true;
        return (0, utils_1.maybePromise)(callback, cb => {
            if (!this.cursor) {
                return cb();
            }
            const cursor = this.cursor;
            return cursor.close(err => {
                endStream(this);
                this.cursor = undefined;
                return cb(err);
            });
        });
    }
    /**
     * Return a modified Readable stream including a possible transform method.
     * @throws MongoDriverError if this.cursor is undefined
     */
    stream(options) {
        this.streamOptions = options;
        if (!this.cursor)
            throw new error_1.MongoChangeStreamError(NO_CURSOR_ERROR);
        return this.cursor.stream(options);
    }
    tryNext(callback) {
        setIsIterator(this);
        return (0, utils_1.maybePromise)(callback, cb => {
            getCursor(this, (err, cursor) => {
                if (err || !cursor)
                    return cb(err); // failed to resume, raise an error
                return cursor.tryNext(cb);
            });
        });
    }
}
exports.ChangeStream = ChangeStream;
/** @event */
ChangeStream.RESPONSE = 'response';
/** @event */
ChangeStream.MORE = 'more';
/** @event */
ChangeStream.INIT = 'init';
/** @event */
ChangeStream.CLOSE = 'close';
/**
 * Fired for each new matching change in the specified namespace. Attaching a `change`
 * event listener to a Change Stream will switch the stream into flowing mode. Data will
 * then be passed as soon as it is available.
 * @event
 */
ChangeStream.CHANGE = 'change';
/** @event */
ChangeStream.END = 'end';
/** @event */
ChangeStream.ERROR = 'error';
/**
 * Emitted each time the change stream stores a new resume token.
 * @event
 */
ChangeStream.RESUME_TOKEN_CHANGED = 'resumeTokenChanged';
/** @internal */
class ChangeStreamCursor extends abstract_cursor_1.AbstractCursor {
    constructor(topology, namespace, pipeline = [], options = {}) {
        super(topology, namespace, options);
        this.pipeline = pipeline;
        this.options = options;
        this._resumeToken = null;
        this.startAtOperationTime = options.startAtOperationTime;
        if (options.startAfter) {
            this.resumeToken = options.startAfter;
        }
        else if (options.resumeAfter) {
            this.resumeToken = options.resumeAfter;
        }
    }
    set resumeToken(token) {
        this._resumeToken = token;
        this.emit(ChangeStream.RESUME_TOKEN_CHANGED, token);
    }
    get resumeToken() {
        return this._resumeToken;
    }
    get resumeOptions() {
        const result = {};
        for (const optionName of CURSOR_OPTIONS) {
            if (Reflect.has(this.options, optionName)) {
                Reflect.set(result, optionName, Reflect.get(this.options, optionName));
            }
        }
        if (this.resumeToken || this.startAtOperationTime) {
            ['resumeAfter', 'startAfter', 'startAtOperationTime'].forEach(key => Reflect.deleteProperty(result, key));
            if (this.resumeToken) {
                const resumeKey = this.options.startAfter && !this.hasReceived ? 'startAfter' : 'resumeAfter';
                Reflect.set(result, resumeKey, this.resumeToken);
            }
            else if (this.startAtOperationTime && (0, utils_1.maxWireVersion)(this.server) >= 7) {
                result.startAtOperationTime = this.startAtOperationTime;
            }
        }
        return result;
    }
    cacheResumeToken(resumeToken) {
        if (this.bufferedCount() === 0 && this.postBatchResumeToken) {
            this.resumeToken = this.postBatchResumeToken;
        }
        else {
            this.resumeToken = resumeToken;
        }
        this.hasReceived = true;
    }
    _processBatch(batchName, response) {
        const cursor = (response === null || response === void 0 ? void 0 : response.cursor) || {};
        if (cursor.postBatchResumeToken) {
            this.postBatchResumeToken = cursor.postBatchResumeToken;
            if (cursor[batchName].length === 0) {
                this.resumeToken = cursor.postBatchResumeToken;
            }
        }
    }
    clone() {
        return new ChangeStreamCursor(this.topology, this.namespace, this.pipeline, {
            ...this.cursorOptions
        });
    }
    _initialize(session, callback) {
        const aggregateOperation = new aggregate_1.AggregateOperation(this.namespace, this.pipeline, {
            ...this.cursorOptions,
            ...this.options,
            session
        });
        (0, execute_operation_1.executeOperation)(this.topology, aggregateOperation, (err, response) => {
            if (err || response == null) {
                return callback(err);
            }
            const server = aggregateOperation.server;
            if (this.startAtOperationTime == null &&
                this.resumeAfter == null &&
                this.startAfter == null &&
                (0, utils_1.maxWireVersion)(server) >= 7) {
                this.startAtOperationTime = response.operationTime;
            }
            this._processBatch('firstBatch', response);
            this.emit(ChangeStream.INIT, response);
            this.emit(ChangeStream.RESPONSE);
            // TODO: NODE-2882
            callback(undefined, { server, session, response });
        });
    }
    _getMore(batchSize, callback) {
        super._getMore(batchSize, (err, response) => {
            if (err) {
                return callback(err);
            }
            this._processBatch('nextBatch', response);
            this.emit(ChangeStream.MORE, response);
            this.emit(ChangeStream.RESPONSE);
            callback(err, response);
        });
    }
}
exports.ChangeStreamCursor = ChangeStreamCursor;
const CHANGE_STREAM_EVENTS = [
    ChangeStream.RESUME_TOKEN_CHANGED,
    ChangeStream.END,
    ChangeStream.CLOSE
];
function setIsEmitter(changeStream) {
    if (changeStream[kMode] === 'iterator') {
        // TODO(NODE-3485): Replace with MongoChangeStreamModeError
        throw new error_1.MongoAPIError('ChangeStream cannot be used as an EventEmitter after being used as an iterator');
    }
    changeStream[kMode] = 'emitter';
}
function setIsIterator(changeStream) {
    if (changeStream[kMode] === 'emitter') {
        // TODO(NODE-3485): Replace with MongoChangeStreamModeError
        throw new error_1.MongoAPIError('ChangeStream cannot be used as an iterator after being used as an EventEmitter');
    }
    changeStream[kMode] = 'iterator';
}
/**
 * Create a new change stream cursor based on self's configuration
 * @internal
 */
function createChangeStreamCursor(changeStream, options) {
    const changeStreamStageOptions = { fullDocument: options.fullDocument || 'default' };
    applyKnownOptions(changeStreamStageOptions, options, CHANGE_STREAM_OPTIONS);
    if (changeStream.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
        changeStreamStageOptions.allChangesForCluster = true;
    }
    const pipeline = [{ $changeStream: changeStreamStageOptions }].concat(changeStream.pipeline);
    const cursorOptions = applyKnownOptions({}, options, CURSOR_OPTIONS);
    const changeStreamCursor = new ChangeStreamCursor((0, utils_1.getTopology)(changeStream.parent), changeStream.namespace, pipeline, cursorOptions);
    for (const event of CHANGE_STREAM_EVENTS) {
        changeStreamCursor.on(event, e => changeStream.emit(event, e));
    }
    if (changeStream.listenerCount(ChangeStream.CHANGE) > 0) {
        streamEvents(changeStream, changeStreamCursor);
    }
    return changeStreamCursor;
}
function applyKnownOptions(target, source, optionNames) {
    optionNames.forEach(name => {
        if (source[name]) {
            target[name] = source[name];
        }
    });
    return target;
}
// This method performs a basic server selection loop, satisfying the requirements of
// ChangeStream resumability until the new SDAM layer can be used.
const SELECTION_TIMEOUT = 30000;
function waitForTopologyConnected(topology, options, callback) {
    setTimeout(() => {
        if (options && options.start == null) {
            options.start = (0, utils_1.now)();
        }
        const start = options.start || (0, utils_1.now)();
        const timeout = options.timeout || SELECTION_TIMEOUT;
        if (topology.isConnected()) {
            return callback();
        }
        if ((0, utils_1.calculateDurationInMs)(start) > timeout) {
            // TODO(NODE-3497): Replace with MongoNetworkTimeoutError
            return callback(new error_1.MongoRuntimeError('Timed out waiting for connection'));
        }
        waitForTopologyConnected(topology, options, callback);
    }, 500); // this is an arbitrary wait time to allow SDAM to transition
}
function closeWithError(changeStream, error, callback) {
    if (!callback) {
        changeStream.emit(ChangeStream.ERROR, error);
    }
    changeStream.close(() => callback && callback(error));
}
function streamEvents(changeStream, cursor) {
    setIsEmitter(changeStream);
    const stream = changeStream[kCursorStream] || cursor.stream();
    changeStream[kCursorStream] = stream;
    stream.on('data', change => processNewChange(changeStream, change));
    stream.on('error', error => processError(changeStream, error));
}
function endStream(changeStream) {
    const cursorStream = changeStream[kCursorStream];
    if (cursorStream) {
        ['data', 'close', 'end', 'error'].forEach(event => cursorStream.removeAllListeners(event));
        cursorStream.destroy();
    }
    changeStream[kCursorStream] = undefined;
}
function processNewChange(changeStream, change, callback) {
    var _a;
    if (changeStream[kClosed]) {
        // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
        if (callback)
            callback(new error_1.MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
        return;
    }
    // a null change means the cursor has been notified, implicitly closing the change stream
    if (change == null) {
        // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
        return closeWithError(changeStream, new error_1.MongoRuntimeError(CHANGESTREAM_CLOSED_ERROR), callback);
    }
    if (change && !change._id) {
        return closeWithError(changeStream, new error_1.MongoChangeStreamError(NO_RESUME_TOKEN_ERROR), callback);
    }
    // cache the resume token
    (_a = changeStream.cursor) === null || _a === void 0 ? void 0 : _a.cacheResumeToken(change._id);
    // wipe the startAtOperationTime if there was one so that there won't be a conflict
    // between resumeToken and startAtOperationTime if we need to reconnect the cursor
    changeStream.options.startAtOperationTime = undefined;
    // Return the change
    if (!callback)
        return changeStream.emit(ChangeStream.CHANGE, change);
    return callback(undefined, change);
}
function processError(changeStream, error, callback) {
    const cursor = changeStream.cursor;
    // If the change stream has been closed explicitly, do not process error.
    if (changeStream[kClosed]) {
        // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
        if (callback)
            callback(new error_1.MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
        return;
    }
    // if the resume succeeds, continue with the new cursor
    function resumeWithCursor(newCursor) {
        changeStream.cursor = newCursor;
        processResumeQueue(changeStream);
    }
    // otherwise, raise an error and close the change stream
    function unresumableError(err) {
        if (!callback) {
            changeStream.emit(ChangeStream.ERROR, err);
        }
        changeStream.close(() => processResumeQueue(changeStream, err));
    }
    if (cursor && (0, error_1.isResumableError)(error, (0, utils_1.maxWireVersion)(cursor.server))) {
        changeStream.cursor = undefined;
        // stop listening to all events from old cursor
        endStream(changeStream);
        // close internal cursor, ignore errors
        cursor.close();
        const topology = (0, utils_1.getTopology)(changeStream.parent);
        waitForTopologyConnected(topology, { readPreference: cursor.readPreference }, err => {
            // if the topology can't reconnect, close the stream
            if (err)
                return unresumableError(err);
            // create a new cursor, preserving the old cursor's options
            const newCursor = createChangeStreamCursor(changeStream, cursor.resumeOptions);
            // attempt to continue in emitter mode
            if (!callback)
                return resumeWithCursor(newCursor);
            // attempt to continue in iterator mode
            newCursor.hasNext(err => {
                // if there's an error immediately after resuming, close the stream
                if (err)
                    return unresumableError(err);
                resumeWithCursor(newCursor);
            });
        });
        return;
    }
    // if initial error wasn't resumable, raise an error and close the change stream
    return closeWithError(changeStream, error, callback);
}
/**
 * Safely provides a cursor across resume attempts
 *
 * @param changeStream - the parent ChangeStream
 */
function getCursor(changeStream, callback) {
    if (changeStream[kClosed]) {
        // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
        callback(new error_1.MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
        return;
    }
    // if a cursor exists and it is open, return it
    if (changeStream.cursor) {
        callback(undefined, changeStream.cursor);
        return;
    }
    // no cursor, queue callback until topology reconnects
    changeStream[kResumeQueue].push(callback);
}
/**
 * Drain the resume queue when a new has become available
 *
 * @param changeStream - the parent ChangeStream
 * @param err - error getting a new cursor
 */
function processResumeQueue(changeStream, err) {
    while (changeStream[kResumeQueue].length) {
        const request = changeStream[kResumeQueue].pop();
        if (!request)
            break; // Should never occur but TS can't use the length check in the while condition
        if (!err) {
            if (changeStream[kClosed]) {
                // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
                request(new error_1.MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
                return;
            }
            if (!changeStream.cursor) {
                request(new error_1.MongoChangeStreamError(NO_CURSOR_ERROR));
                return;
            }
        }
        request(err, changeStream.cursor);
    }
}
//# sourceMappingURL=change_stream.js.map