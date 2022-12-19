"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertUninitialized = exports.next = exports.AbstractCursor = exports.CURSOR_FLAGS = void 0;
const stream_1 = require("stream");
const util_1 = require("util");
const bson_1 = require("../bson");
const error_1 = require("../error");
const mongo_types_1 = require("../mongo_types");
const execute_operation_1 = require("../operations/execute_operation");
const get_more_1 = require("../operations/get_more");
const kill_cursors_1 = require("../operations/kill_cursors");
const promise_provider_1 = require("../promise_provider");
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
const kClient = Symbol('client');
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
/** @internal */
const kInit = Symbol('kInit');
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
    constructor(client, namespace, options = {}) {
        super();
        if (!client.s.isMongoClient) {
            throw new error_1.MongoRuntimeError('Cursor must be constructed with MongoClient');
        }
        this[kClient] = client;
        this[kNamespace] = namespace;
        this[kId] = null;
        this[kDocuments] = new utils_1.List();
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
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if (options.comment !== undefined) {
            this[kOptions].comment = options.comment;
        }
        if (typeof options.maxTimeMS === 'number') {
            this[kOptions].maxTimeMS = options.maxTimeMS;
        }
        if (typeof options.maxAwaitTimeMS === 'number') {
            this[kOptions].maxAwaitTimeMS = options.maxAwaitTimeMS;
        }
        if (options.session instanceof sessions_1.ClientSession) {
            this[kSession] = options.session;
        }
        else {
            this[kSession] = this[kClient].startSession({ owner: this, explicit: false });
        }
    }
    get id() {
        var _a;
        return (_a = this[kId]) !== null && _a !== void 0 ? _a : undefined;
    }
    /** @internal */
    get client() {
        return this[kClient];
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
        var _a;
        return !!((_a = this[kClient].topology) === null || _a === void 0 ? void 0 : _a.loadBalanced);
    }
    /** Returns current buffered documents length */
    bufferedCount() {
        return this[kDocuments].length;
    }
    /** Returns current buffered documents */
    readBufferedDocuments(number) {
        const bufferedDocs = [];
        const documentsToRead = Math.min(number !== null && number !== void 0 ? number : this[kDocuments].length, this[kDocuments].length);
        for (let count = 0; count < documentsToRead; count++) {
            const document = this[kDocuments].shift();
            if (document != null) {
                bufferedDocs.push(document);
            }
        }
        return bufferedDocs;
    }
    [Symbol.asyncIterator]() {
        async function* nativeAsyncIterator() {
            if (this.closed) {
                return;
            }
            while (true) {
                const document = await this.next();
                // Intentional strict null check, because users can map cursors to falsey values.
                // We allow mapping to all values except for null.
                // eslint-disable-next-line no-restricted-syntax
                if (document === null) {
                    if (!this.closed) {
                        const message = 'Cursor returned a `null` document, but the cursor is not exhausted.  Mapping documents to `null` is not supported in the cursor transform.';
                        await cleanupCursorAsync(this, { needsToEmitClosed: true }).catch(() => null);
                        throw new error_1.MongoAPIError(message);
                    }
                    break;
                }
                yield document;
                if (this[kId] === bson_1.Long.ZERO) {
                    // Cursor exhausted
                    break;
                }
            }
        }
        const iterator = nativeAsyncIterator.call(this);
        if (promise_provider_1.PromiseProvider.get() == null) {
            return iterator;
        }
        return {
            next: () => (0, utils_1.maybeCallback)(() => iterator.next(), null)
        };
    }
    stream(options) {
        if (options === null || options === void 0 ? void 0 : options.transform) {
            const transform = options.transform;
            const readable = new ReadableCursorStream(this);
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
        return new ReadableCursorStream(this);
    }
    hasNext(callback) {
        return (0, utils_1.maybeCallback)(async () => {
            if (this[kId] === bson_1.Long.ZERO) {
                return false;
            }
            if (this[kDocuments].length !== 0) {
                return true;
            }
            const doc = await nextAsync(this, true);
            if (doc) {
                this[kDocuments].unshift(doc);
                return true;
            }
            return false;
        }, callback);
    }
    next(callback) {
        return (0, utils_1.maybeCallback)(async () => {
            if (this[kId] === bson_1.Long.ZERO) {
                throw new error_1.MongoCursorExhaustedError();
            }
            return nextAsync(this, true);
        }, callback);
    }
    tryNext(callback) {
        return (0, utils_1.maybeCallback)(async () => {
            if (this[kId] === bson_1.Long.ZERO) {
                throw new error_1.MongoCursorExhaustedError();
            }
            return nextAsync(this, false);
        }, callback);
    }
    forEach(iterator, callback) {
        if (typeof iterator !== 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "iterator" must be a function');
        }
        return (0, utils_1.maybeCallback)(async () => {
            for await (const document of this) {
                const result = iterator(document);
                if (result === false) {
                    break;
                }
            }
        }, callback);
    }
    close(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        const needsToEmitClosed = !this[kClosed];
        this[kClosed] = true;
        return (0, utils_1.maybeCallback)(async () => cleanupCursorAsync(this, { needsToEmitClosed }), callback);
    }
    toArray(callback) {
        return (0, utils_1.maybeCallback)(async () => {
            const array = [];
            for await (const document of this) {
                array.push(document);
            }
            return array;
        }, callback);
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
     *
     * **Note** Cursors use `null` internally to indicate that there are no more documents in the cursor. Providing a mapping
     * function that maps values to `null` will result in the cursor closing itself before it has finished iterating
     * all documents.  This will **not** result in a memory leak, just surprising behavior.  For example:
     *
     * ```typescript
     * const cursor = collection.find({});
     * cursor.map(() => null);
     *
     * const documents = await cursor.toArray();
     * // documents is always [], regardless of how many documents are in the collection.
     * ```
     *
     * Other falsey values are allowed:
     *
     * ```typescript
     * const cursor = collection.find({});
     * cursor.map(() => '');
     *
     * const documents = await cursor.toArray();
     * // documents is now an array of empty strings
     * ```
     *
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
        this[kId] = null;
        this[kDocuments].clear();
        this[kClosed] = false;
        this[kKilled] = false;
        this[kInitialized] = false;
        const session = this[kSession];
        if (session) {
            // We only want to end this session if we created it, and it hasn't ended yet
            if (session.explicit === false) {
                if (!session.hasEnded) {
                    session.endSession().catch(() => null);
                }
                this[kSession] = this.client.startSession({ owner: this, explicit: false });
            }
        }
    }
    /** @internal */
    _getMore(batchSize, callback) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const getMoreOperation = new get_more_1.GetMoreOperation(this[kNamespace], this[kId], this[kServer], {
            ...this[kOptions],
            session: this[kSession],
            batchSize
        });
        (0, execute_operation_1.executeOperation)(this[kClient], getMoreOperation, callback);
    }
    /**
     * @internal
     *
     * This function is exposed for the unified test runner's createChangeStream
     * operation.  We cannot refactor to use the abstract _initialize method without
     * a significant refactor.
     */
    [kInit](callback) {
        this._initialize(this[kSession], (error, state) => {
            if (state) {
                const response = state.response;
                this[kServer] = state.server;
                if (response.cursor) {
                    // TODO(NODE-2674): Preserve int64 sent from MongoDB
                    this[kId] =
                        typeof response.cursor.id === 'number'
                            ? bson_1.Long.fromNumber(response.cursor.id)
                            : response.cursor.id;
                    if (response.cursor.ns) {
                        this[kNamespace] = (0, utils_1.ns)(response.cursor.ns);
                    }
                    this[kDocuments].pushMany(response.cursor.firstBatch);
                }
                // When server responses return without a cursor document, we close this cursor
                // and return the raw server response. This is often the case for explain commands
                // for example
                if (this[kId] == null) {
                    this[kId] = bson_1.Long.ZERO;
                    // TODO(NODE-3286): ExecutionResult needs to accept a generic parameter
                    this[kDocuments].push(state.response);
                }
            }
            // the cursor is now initialized, even if an error occurred or it is dead
            this[kInitialized] = true;
            if (error) {
                return cleanupCursor(this, { error }, () => callback(error, undefined));
            }
            if (cursorIsDead(this)) {
                return cleanupCursor(this, undefined, () => callback());
            }
            callback();
        });
    }
}
exports.AbstractCursor = AbstractCursor;
/** @event */
AbstractCursor.CLOSE = 'close';
function nextDocument(cursor) {
    const doc = cursor[kDocuments].shift();
    if (doc && cursor[kTransform]) {
        return cursor[kTransform](doc);
    }
    return doc;
}
const nextAsync = (0, util_1.promisify)(next);
/**
 * @param cursor - the cursor on which to call `next`
 * @param blocking - a boolean indicating whether or not the cursor should `block` until data
 *     is available.  Generally, this flag is set to `false` because if the getMore returns no documents,
 *     the cursor has been exhausted.  In certain scenarios (ChangeStreams, tailable await cursors and
 *     `tryNext`, for example) blocking is necessary because a getMore returning no documents does
 *     not indicate the end of the cursor.
 * @param callback - callback to return the result to the caller
 * @returns
 */
function next(cursor, blocking, callback) {
    const cursorId = cursor[kId];
    if (cursor.closed) {
        return callback(undefined, null);
    }
    if (cursor[kDocuments].length !== 0) {
        callback(undefined, nextDocument(cursor));
        return;
    }
    if (cursorId == null) {
        // All cursors must operate within a session, one must be made implicitly if not explicitly provided
        cursor[kInit](err => {
            if (err)
                return callback(err);
            return next(cursor, blocking, callback);
        });
        return;
    }
    if (cursorIsDead(cursor)) {
        return cleanupCursor(cursor, undefined, () => callback(undefined, null));
    }
    // otherwise need to call getMore
    const batchSize = cursor[kOptions].batchSize || 1000;
    cursor._getMore(batchSize, (error, response) => {
        if (response) {
            const cursorId = typeof response.cursor.id === 'number'
                ? bson_1.Long.fromNumber(response.cursor.id)
                : response.cursor.id;
            cursor[kDocuments].pushMany(response.cursor.nextBatch);
            cursor[kId] = cursorId;
        }
        if (error || cursorIsDead(cursor)) {
            return cleanupCursor(cursor, { error }, () => callback(error, nextDocument(cursor)));
        }
        if (cursor[kDocuments].length === 0 && blocking === false) {
            return callback(undefined, null);
        }
        next(cursor, blocking, callback);
    });
}
exports.next = next;
function cursorIsDead(cursor) {
    const cursorId = cursor[kId];
    return !!cursorId && cursorId.isZero();
}
const cleanupCursorAsync = (0, util_1.promisify)(cleanupCursor);
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
    return (0, execute_operation_1.executeOperation)(cursor[kClient], new kill_cursors_1.KillCursorsOperation(cursorId, cursorNs, server, { session }), completeCleanup);
}
/** @internal */
function assertUninitialized(cursor) {
    if (cursor[kInitialized]) {
        throw new error_1.MongoCursorInUseError();
    }
}
exports.assertUninitialized = assertUninitialized;
class ReadableCursorStream extends stream_1.Readable {
    constructor(cursor) {
        super({
            objectMode: true,
            autoDestroy: false,
            highWaterMark: 1
        });
        this._readInProgress = false;
        this._cursor = cursor;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _read(size) {
        if (!this._readInProgress) {
            this._readInProgress = true;
            this._readNext();
        }
    }
    _destroy(error, callback) {
        this._cursor.close(err => process.nextTick(callback, err || error));
    }
    _readNext() {
        next(this._cursor, true, (err, result) => {
            if (err) {
                // NOTE: This is questionable, but we have a test backing the behavior. It seems the
                //       desired behavior is that a stream ends cleanly when a user explicitly closes
                //       a client during iteration. Alternatively, we could do the "right" thing and
                //       propagate the error message by removing this special case.
                if (err.message.match(/server is closed/)) {
                    this._cursor.close().catch(() => null);
                    return this.push(null);
                }
                // NOTE: This is also perhaps questionable. The rationale here is that these errors tend
                //       to be "operation was interrupted", where a cursor has been closed but there is an
                //       active getMore in-flight. This used to check if the cursor was killed but once
                //       that changed to happen in cleanup legitimate errors would not destroy the
                //       stream. There are change streams test specifically test these cases.
                if (err.message.match(/operation was interrupted/)) {
                    return this.push(null);
                }
                // NOTE: The two above checks on the message of the error will cause a null to be pushed
                //       to the stream, thus closing the stream before the destroy call happens. This means
                //       that either of those error messages on a change stream will not get a proper
                //       'error' event to be emitted (the error passed to destroy). Change stream resumability
                //       relies on that error event to be emitted to create its new cursor and thus was not
                //       working on 4.4 servers because the error emitted on failover was "interrupted at
                //       shutdown" while on 5.0+ it is "The server is in quiesce mode and will shut down".
                //       See NODE-4475.
                return this.destroy(err);
            }
            if (result == null) {
                this.push(null);
            }
            else if (this.destroyed) {
                this._cursor.close().catch(() => null);
            }
            else {
                if (this.push(result)) {
                    return this._readNext();
                }
                this._readInProgress = false;
            }
        });
    }
}
//# sourceMappingURL=abstract_cursor.js.map