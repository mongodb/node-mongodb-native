"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertUninitialized = exports.AbstractCursor = exports.CURSOR_FLAGS = void 0;
const stream_1 = require("stream");
const bson_1 = require("../bson");
const error_1 = require("../error");
const mongo_types_1 = require("../mongo_types");
const execute_operation_1 = require("../operations/execute_operation");
const get_more_1 = require("../operations/get_more");
const read_concern_1 = require("../read_concern");
const read_preference_1 = require("../read_preference");
const sessions_1 = require("../sessions");
const utils_1 = require("../utils");
/** @internal */
const kId = Symbol('id');
/** @internal */
const kDocuments = Symbol('documents');
/** @internal */
const kServer = Symbol('server');
/** @internal */
const kNamespace = Symbol('namespace');
/** @internal */
const kTopology = Symbol('topology');
/** @internal */
const kSession = Symbol('session');
/** @internal */
const kOptions = Symbol('options');
/** @internal */
const kTransform = Symbol('transform');
/** @internal */
const kInitialized = Symbol('initialized');
/** @internal */
const kClosed = Symbol('closed');
/** @internal */
const kKilled = Symbol('killed');
/** @public */
exports.CURSOR_FLAGS = [
    'tailable',
    'oplogReplay',
    'noCursorTimeout',
    'awaitData',
    'exhaust',
    'partial'
];
/** @public */
class AbstractCursor extends mongo_types_1.TypedEventEmitter {
    /** @internal */
    constructor(topology, namespace, options = {}) {
        super();
        this[kTopology] = topology;
        this[kNamespace] = namespace;
        this[kDocuments] = []; // TODO: https://github.com/microsoft/TypeScript/issues/36230
        this[kInitialized] = false;
        this[kClosed] = false;
        this[kKilled] = false;
        this[kOptions] = {
            readPreference: options.readPreference && options.readPreference instanceof read_preference_1.ReadPreference
                ? options.readPreference
                : read_preference_1.ReadPreference.primary,
            ...(0, bson_1.pluckBSONSerializeOptions)(options)
        };
        const readConcern = read_concern_1.ReadConcern.fromOptions(options);
        if (readConcern) {
            this[kOptions].readConcern = readConcern;
        }
        if (typeof options.batchSize === 'number') {
            this[kOptions].batchSize = options.batchSize;
        }
        if (options.comment != null) {
            this[kOptions].comment = options.comment;
        }
        if (typeof options.maxTimeMS === 'number') {
            this[kOptions].maxTimeMS = options.maxTimeMS;
        }
        if (options.session instanceof sessions_1.ClientSession) {
            this[kSession] = options.session;
        }
    }
    get id() {
        return this[kId];
    }
    /** @internal */
    get topology() {
        return this[kTopology];
    }
    /** @internal */
    get server() {
        return this[kServer];
    }
    get namespace() {
        return this[kNamespace];
    }
    get readPreference() {
        return this[kOptions].readPreference;
    }
    get readConcern() {
        return this[kOptions].readConcern;
    }
    /** @internal */
    get session() {
        return this[kSession];
    }
    set session(clientSession) {
        this[kSession] = clientSession;
    }
    /** @internal */
    get cursorOptions() {
        return this[kOptions];
    }
    get closed() {
        return this[kClosed];
    }
    get killed() {
        return this[kKilled];
    }
    get loadBalanced() {
        return this[kTopology].loadBalanced;
    }
    /** Returns current buffered documents length */
    bufferedCount() {
        return this[kDocuments].length;
    }
    /** Returns current buffered documents */
    readBufferedDocuments(number) {
        return this[kDocuments].splice(0, number !== null && number !== void 0 ? number : this[kDocuments].length);
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => this.next().then(value => value != null ? { value, done: false } : { value: undefined, done: true })
        };
    }
    stream(options) {
        if (options === null || options === void 0 ? void 0 : options.transform) {
            const transform = options.transform;
            const readable = makeCursorStream(this);
            return readable.pipe(new stream_1.Transform({
                objectMode: true,
                highWaterMark: 1,
                transform(chunk, _, callback) {
                    try {
                        const transformed = transform(chunk);
                        callback(undefined, transformed);
                    }
                    catch (err) {
                        callback(err);
                    }
                }
            }));
        }
        return makeCursorStream(this);
    }
    hasNext(callback) {
        return (0, utils_1.maybePromise)(callback, done => {
            if (this[kId] === bson_1.Long.ZERO) {
                return done(undefined, false);
            }
            if (this[kDocuments].length) {
                return done(undefined, true);
            }
            next(this, true, (err, doc) => {
                if (err)
                    return done(err);
                if (doc) {
                    this[kDocuments].unshift(doc);
                    done(undefined, true);
                    return;
                }
                done(undefined, false);
            });
        });
    }
    next(callback) {
        return (0, utils_1.maybePromise)(callback, done => {
            if (this[kId] === bson_1.Long.ZERO) {
                return done(new error_1.MongoCursorExhaustedError());
            }
            next(this, true, done);
        });
    }
    tryNext(callback) {
        return (0, utils_1.maybePromise)(callback, done => {
            if (this[kId] === bson_1.Long.ZERO) {
                return done(new error_1.MongoCursorExhaustedError());
            }
            next(this, false, done);
        });
    }
    forEach(iterator, callback) {
        if (typeof iterator !== 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "iterator" must be a function');
        }
        return (0, utils_1.maybePromise)(callback, done => {
            const transform = this[kTransform];
            const fetchDocs = () => {
                next(this, true, (err, doc) => {
                    if (err || doc == null)
                        return done(err);
                    let result;
                    // NOTE: no need to transform because `next` will do this automatically
                    try {
                        result = iterator(doc); // TODO(NODE-3283): Improve transform typing
                    }
                    catch (error) {
                        return done(error);
                    }
                    if (result === false)
                        return done();
                    // these do need to be transformed since they are copying the rest of the batch
                    const internalDocs = this[kDocuments].splice(0, this[kDocuments].length);
                    for (let i = 0; i < internalDocs.length; ++i) {
                        try {
                            result = iterator((transform ? transform(internalDocs[i]) : internalDocs[i]) // TODO(NODE-3283): Improve transform typing
                            );
                        }
                        catch (error) {
                            return done(error);
                        }
                        if (result === false)
                            return done();
                    }
                    fetchDocs();
                });
            };
            fetchDocs();
        });
    }
    close(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        const needsToEmitClosed = !this[kClosed];
        this[kClosed] = true;
        return (0, utils_1.maybePromise)(callback, done => cleanupCursor(this, { needsToEmitClosed }, done));
    }
    toArray(callback) {
        return (0, utils_1.maybePromise)(callback, done => {
            const docs = [];
            const transform = this[kTransform];
            const fetchDocs = () => {
                // NOTE: if we add a `nextBatch` then we should use it here
                next(this, true, (err, doc) => {
                    if (err)
                        return done(err);
                    if (doc == null)
                        return done(undefined, docs);
                    // NOTE: no need to transform because `next` will do this automatically
                    docs.push(doc);
                    // these do need to be transformed since they are copying the rest of the batch
                    const internalDocs = (transform
                        ? this[kDocuments].splice(0, this[kDocuments].length).map(transform)
                        : this[kDocuments].splice(0, this[kDocuments].length)); // TODO(NODE-3283): Improve transform typing
                    if (internalDocs) {
                        docs.push(...internalDocs);
                    }
                    fetchDocs();
                });
            };
            fetchDocs();
        });
    }
    /**
     * Add a cursor flag to the cursor
     *
     * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
     * @param value - The flag boolean value.
     */
    addCursorFlag(flag, value) {
        assertUninitialized(this);
        if (!exports.CURSOR_FLAGS.includes(flag)) {
            throw new error_1.MongoInvalidArgumentError(`Flag ${flag} is not one of ${exports.CURSOR_FLAGS}`);
        }
        if (typeof value !== 'boolean') {
            throw new error_1.MongoInvalidArgumentError(`Flag ${flag} must be a boolean value`);
        }
        this[kOptions][flag] = value;
        return this;
    }
    /**
     * Map all documents using the provided function
     * If there is a transform set on the cursor, that will be called first and the result passed to
     * this function's transform.
     *
     * @remarks
     * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
     * it **does not** return a new instance of a cursor. This means when calling map,
     * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
     * Take note of the following example:
     *
     * @example
     * ```typescript
     * const cursor: FindCursor<Document> = coll.find();
     * const mappedCursor: FindCursor<number> = cursor.map(doc => Object.keys(doc).length);
     * const keyCounts: number[] = await mappedCursor.toArray(); // cursor.toArray() still returns Document[]
     * ```
     * @param transform - The mapping transformation method.
     */
    map(transform) {
        assertUninitialized(this);
        const oldTransform = this[kTransform]; // TODO(NODE-3283): Improve transform typing
        if (oldTransform) {
            this[kTransform] = doc => {
                return transform(oldTransform(doc));
            };
        }
        else {
            this[kTransform] = transform;
        }
        return this;
    }
    /**
     * Set the ReadPreference for the cursor.
     *
     * @param readPreference - The new read preference for the cursor.
     */
    withReadPreference(readPreference) {
        assertUninitialized(this);
        if (readPreference instanceof read_preference_1.ReadPreference) {
            this[kOptions].readPreference = readPreference;
        }
        else if (typeof readPreference === 'string') {
            this[kOptions].readPreference = read_preference_1.ReadPreference.fromString(readPreference);
        }
        else {
            throw new error_1.MongoInvalidArgumentError(`Invalid read preference: ${readPreference}`);
        }
        return this;
    }
    /**
     * Set the ReadPreference for the cursor.
     *
     * @param readPreference - The new read preference for the cursor.
     */
    withReadConcern(readConcern) {
        assertUninitialized(this);
        const resolvedReadConcern = read_concern_1.ReadConcern.fromOptions({ readConcern });
        if (resolvedReadConcern) {
            this[kOptions].readConcern = resolvedReadConcern;
        }
        return this;
    }
    /**
     * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
     *
     * @param value - Number of milliseconds to wait before aborting the query.
     */
    maxTimeMS(value) {
        assertUninitialized(this);
        if (typeof value !== 'number') {
            throw new error_1.MongoInvalidArgumentError('Argument for maxTimeMS must be a number');
        }
        this[kOptions].maxTimeMS = value;
        return this;
    }
    /**
     * Set the batch size for the cursor.
     *
     * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
     */
    batchSize(value) {
        assertUninitialized(this);
        if (this[kOptions].tailable) {
            throw new error_1.MongoTailableCursorError('Tailable cursor does not support batchSize');
        }
        if (typeof value !== 'number') {
            throw new error_1.MongoInvalidArgumentError('Operation "batchSize" requires an integer');
        }
        this[kOptions].batchSize = value;
        return this;
    }
    /**
     * Rewind this cursor to its uninitialized state. Any options that are present on the cursor will
     * remain in effect. Iterating this cursor will cause new queries to be sent to the server, even
     * if the resultant data has already been retrieved by this cursor.
     */
    rewind() {
        if (!this[kInitialized]) {
            return;
        }
        this[kId] = undefined;
        this[kDocuments] = [];
        this[kClosed] = false;
        this[kKilled] = false;
        this[kInitialized] = false;
        const session = this[kSession];
        if (session) {
            // We only want to end this session if we created it, and it hasn't ended yet
            if (session.explicit === false && !session.hasEnded) {
                session.endSession();
            }
            this[kSession] = undefined;
        }
    }
    /** @internal */
    _getMore(batchSize, callback) {
        const cursorId = this[kId];
        const cursorNs = this[kNamespace];
        const server = this[kServer];
        if (cursorId == null) {
            callback(new error_1.MongoRuntimeError('Unable to iterate cursor with no id'));
            return;
        }
        if (server == null) {
            callback(new error_1.MongoRuntimeError('Unable to iterate cursor without selected server'));
            return;
        }
        const getMoreOperation = new get_more_1.GetMoreOperation(cursorNs, cursorId, server, {
            ...this[kOptions],
            session: this[kSession],
            batchSize
        });
        (0, execute_operation_1.executeOperation)(this.topology, getMoreOperation, callback);
    }
}
exports.AbstractCursor = AbstractCursor;
/** @event */
AbstractCursor.CLOSE = 'close';
function nextDocument(cursor) {
    if (cursor[kDocuments] == null || !cursor[kDocuments].length) {
        return null;
    }
    const doc = cursor[kDocuments].shift();
    if (doc) {
        const transform = cursor[kTransform];
        if (transform) {
            return transform(doc);
        }
        return doc;
    }
    return null;
}
function next(cursor, blocking, callback) {
    const cursorId = cursor[kId];
    if (cursor.closed) {
        return callback(undefined, null);
    }
    if (cursor[kDocuments] && cursor[kDocuments].length) {
        callback(undefined, nextDocument(cursor));
        return;
    }
    if (cursorId == null) {
        // All cursors must operate within a session, one must be made implicitly if not explicitly provided
        if (cursor[kSession] == null) {
            if (cursor[kTopology].shouldCheckForSessionSupport()) {
                return cursor[kTopology].selectServer(read_preference_1.ReadPreference.primaryPreferred, err => {
                    if (err)
                        return callback(err);
                    return next(cursor, blocking, callback);
                });
            }
            else if (cursor[kTopology].hasSessionSupport()) {
                cursor[kSession] = cursor[kTopology].startSession({ owner: cursor, explicit: false });
            }
        }
        cursor._initialize(cursor[kSession], (err, state) => {
            if (state) {
                const response = state.response;
                cursor[kServer] = state.server;
                cursor[kSession] = state.session;
                if (response.cursor) {
                    cursor[kId] =
                        typeof response.cursor.id === 'number'
                            ? bson_1.Long.fromNumber(response.cursor.id)
                            : response.cursor.id;
                    if (response.cursor.ns) {
                        cursor[kNamespace] = (0, utils_1.ns)(response.cursor.ns);
                    }
                    cursor[kDocuments] = response.cursor.firstBatch;
                }
                else {
                    // NOTE: This is for support of older servers (<3.2) which do not use commands
                    cursor[kId] =
                        typeof response.cursorId === 'number'
                            ? bson_1.Long.fromNumber(response.cursorId)
                            : response.cursorId;
                    cursor[kDocuments] = response.documents;
                }
                // When server responses return without a cursor document, we close this cursor
                // and return the raw server response. This is often the case for explain commands
                // for example
                if (cursor[kId] == null) {
                    cursor[kId] = bson_1.Long.ZERO;
                    // TODO(NODE-3286): ExecutionResult needs to accept a generic parameter
                    cursor[kDocuments] = [state.response];
                }
            }
            // the cursor is now initialized, even if an error occurred or it is dead
            cursor[kInitialized] = true;
            if (err || cursorIsDead(cursor)) {
                return cleanupCursor(cursor, { error: err }, () => callback(err, nextDocument(cursor)));
            }
            next(cursor, blocking, callback);
        });
        return;
    }
    if (cursorIsDead(cursor)) {
        return cleanupCursor(cursor, undefined, () => callback(undefined, null));
    }
    // otherwise need to call getMore
    const batchSize = cursor[kOptions].batchSize || 1000;
    cursor._getMore(batchSize, (err, response) => {
        if (response) {
            const cursorId = typeof response.cursor.id === 'number'
                ? bson_1.Long.fromNumber(response.cursor.id)
                : response.cursor.id;
            cursor[kDocuments] = response.cursor.nextBatch;
            cursor[kId] = cursorId;
        }
        if (err || cursorIsDead(cursor)) {
            return cleanupCursor(cursor, { error: err }, () => callback(err, nextDocument(cursor)));
        }
        if (cursor[kDocuments].length === 0 && blocking === false) {
            return callback(undefined, null);
        }
        next(cursor, blocking, callback);
    });
}
function cursorIsDead(cursor) {
    const cursorId = cursor[kId];
    return !!cursorId && cursorId.isZero();
}
function cleanupCursor(cursor, options, callback) {
    var _a;
    const cursorId = cursor[kId];
    const cursorNs = cursor[kNamespace];
    const server = cursor[kServer];
    const session = cursor[kSession];
    const error = options === null || options === void 0 ? void 0 : options.error;
    const needsToEmitClosed = (_a = options === null || options === void 0 ? void 0 : options.needsToEmitClosed) !== null && _a !== void 0 ? _a : cursor[kDocuments].length === 0;
    if (error) {
        if (cursor.loadBalanced && error instanceof error_1.MongoNetworkError) {
            return completeCleanup();
        }
    }
    if (cursorId == null || server == null || cursorId.isZero() || cursorNs == null) {
        if (needsToEmitClosed) {
            cursor[kClosed] = true;
            cursor[kId] = bson_1.Long.ZERO;
            cursor.emit(AbstractCursor.CLOSE);
        }
        if (session) {
            if (session.owner === cursor) {
                return session.endSession({ error }, callback);
            }
            if (!session.inTransaction()) {
                (0, sessions_1.maybeClearPinnedConnection)(session, { error });
            }
        }
        return callback();
    }
    function completeCleanup() {
        if (session) {
            if (session.owner === cursor) {
                return session.endSession({ error }, () => {
                    cursor.emit(AbstractCursor.CLOSE);
                    callback();
                });
            }
            if (!session.inTransaction()) {
                (0, sessions_1.maybeClearPinnedConnection)(session, { error });
            }
        }
        cursor.emit(AbstractCursor.CLOSE);
        return callback();
    }
    cursor[kKilled] = true;
    server.killCursors(cursorNs, [cursorId], { ...(0, bson_1.pluckBSONSerializeOptions)(cursor[kOptions]), session }, () => completeCleanup());
}
/** @internal */
function assertUninitialized(cursor) {
    if (cursor[kInitialized]) {
        throw new error_1.MongoCursorInUseError();
    }
}
exports.assertUninitialized = assertUninitialized;
function makeCursorStream(cursor) {
    const readable = new stream_1.Readable({
        objectMode: true,
        autoDestroy: false,
        highWaterMark: 1
    });
    let initialized = false;
    let reading = false;
    let needToClose = true; // NOTE: we must close the cursor if we never read from it, use `_construct` in future node versions
    readable._read = function () {
        if (initialized === false) {
            needToClose = false;
            initialized = true;
        }
        if (!reading) {
            reading = true;
            readNext();
        }
    };
    readable._destroy = function (error, cb) {
        if (needToClose) {
            cursor.close(err => process.nextTick(cb, err || error));
        }
        else {
            cb(error);
        }
    };
    function readNext() {
        needToClose = false;
        next(cursor, true, (err, result) => {
            needToClose = err ? !cursor.closed : result != null;
            if (err) {
                // NOTE: This is questionable, but we have a test backing the behavior. It seems the
                //       desired behavior is that a stream ends cleanly when a user explicitly closes
                //       a client during iteration. Alternatively, we could do the "right" thing and
                //       propagate the error message by removing this special case.
                if (err.message.match(/server is closed/)) {
                    cursor.close();
                    return readable.push(null);
                }
                // NOTE: This is also perhaps questionable. The rationale here is that these errors tend
                //       to be "operation interrupted", where a cursor has been closed but there is an
                //       active getMore in-flight. This used to check if the cursor was killed but once
                //       that changed to happen in cleanup legitimate errors would not destroy the
                //       stream. There are change streams test specifically test these cases.
                if (err.message.match(/interrupted/)) {
                    return readable.push(null);
                }
                return readable.destroy(err);
            }
            if (result == null) {
                readable.push(null);
            }
            else if (readable.destroyed) {
                cursor.close();
            }
            else {
                if (readable.push(result)) {
                    return readNext();
                }
                reading = false;
            }
        });
    }
    return readable;
}
//# sourceMappingURL=abstract_cursor.js.map