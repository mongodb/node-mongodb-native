"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMongoDBClientEncryption = exports.commandSupportsReadConcern = exports.shuffle = exports.parsePackageVersion = exports.supportsRetryableWrites = exports.enumToString = exports.emitWarningOnce = exports.emitWarning = exports.MONGODB_WARNING_CODE = exports.DEFAULT_PK_FACTORY = exports.HostAddress = exports.BufferPool = exports.List = exports.deepCopy = exports.isRecord = exports.setDifference = exports.isHello = exports.isSuperset = exports.resolveOptions = exports.hasAtomicOperators = exports.calculateDurationInMs = exports.now = exports.makeClientMetadata = exports.makeStateMachine = exports.errorStrictEqual = exports.arrayStrictEqual = exports.eachAsyncSeries = exports.eachAsync = exports.maxWireVersion = exports.uuidV4 = exports.databaseNamespace = exports.maybeCallback = exports.makeCounter = exports.MongoDBNamespace = exports.ns = exports.deprecateOptions = exports.defaultMsgHandler = exports.getTopology = exports.decorateWithExplain = exports.decorateWithReadConcern = exports.decorateWithCollation = exports.isPromiseLike = exports.applyWriteConcern = exports.applyRetryableWrites = exports.filterOptions = exports.mergeOptions = exports.isObject = exports.normalizeHintField = exports.checkCollectionName = exports.ByteUtils = void 0;
exports.parseUnsignedInteger = exports.parseInteger = exports.compareObjectId = void 0;
const crypto = require("crypto");
const os = require("os");
const url_1 = require("url");
const bson_1 = require("./bson");
const constants_1 = require("./cmap/wire_protocol/constants");
const constants_2 = require("./constants");
const error_1 = require("./error");
const promise_provider_1 = require("./promise_provider");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const common_1 = require("./sdam/common");
const write_concern_1 = require("./write_concern");
exports.ByteUtils = {
    equals(seqA, seqB) {
        return (Buffer.isBuffer(seqA) ? seqA : Buffer.from(seqA.buffer, seqA.byteOffset, seqA.byteLength)).equals(seqB);
    },
    compare(seqA, seqB) {
        return (Buffer.isBuffer(seqA) ? seqA : Buffer.from(seqA.buffer, seqA.byteOffset, seqA.byteLength)).compare(seqB);
    },
    toBase64(uint8array) {
        return (Buffer.isBuffer(uint8array)
            ? uint8array
            : Buffer.from(uint8array.buffer, uint8array.byteOffset, uint8array.byteLength)).toString('base64');
    }
};
/**
 * Throws if collectionName is not a valid mongodb collection namespace.
 * @internal
 */
function checkCollectionName(collectionName) {
    if ('string' !== typeof collectionName) {
        throw new error_1.MongoInvalidArgumentError('Collection name must be a String');
    }
    if (!collectionName || collectionName.indexOf('..') !== -1) {
        throw new error_1.MongoInvalidArgumentError('Collection names cannot be empty');
    }
    if (collectionName.indexOf('$') !== -1 &&
        collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null) {
        // TODO(NODE-3483): Use MongoNamespace static method
        throw new error_1.MongoInvalidArgumentError("Collection names must not contain '$'");
    }
    if (collectionName.match(/^\.|\.$/) != null) {
        // TODO(NODE-3483): Use MongoNamespace static method
        throw new error_1.MongoInvalidArgumentError("Collection names must not start or end with '.'");
    }
    // Validate that we are not passing 0x00 in the collection name
    if (collectionName.indexOf('\x00') !== -1) {
        // TODO(NODE-3483): Use MongoNamespace static method
        throw new error_1.MongoInvalidArgumentError('Collection names cannot contain a null character');
    }
}
exports.checkCollectionName = checkCollectionName;
/**
 * Ensure Hint field is in a shape we expect:
 * - object of index names mapping to 1 or -1
 * - just an index name
 * @internal
 */
function normalizeHintField(hint) {
    let finalHint = undefined;
    if (typeof hint === 'string') {
        finalHint = hint;
    }
    else if (Array.isArray(hint)) {
        finalHint = {};
        hint.forEach(param => {
            finalHint[param] = 1;
        });
    }
    else if (hint != null && typeof hint === 'object') {
        finalHint = {};
        for (const name in hint) {
            finalHint[name] = hint[name];
        }
    }
    return finalHint;
}
exports.normalizeHintField = normalizeHintField;
const TO_STRING = (object) => Object.prototype.toString.call(object);
/**
 * Checks if arg is an Object:
 * - **NOTE**: the check is based on the `[Symbol.toStringTag]() === 'Object'`
 * @internal
 */
function isObject(arg) {
    return '[object Object]' === TO_STRING(arg);
}
exports.isObject = isObject;
/** @internal */
function mergeOptions(target, source) {
    return { ...target, ...source };
}
exports.mergeOptions = mergeOptions;
/** @internal */
function filterOptions(options, names) {
    const filterOptions = {};
    for (const name in options) {
        if (names.includes(name)) {
            filterOptions[name] = options[name];
        }
    }
    // Filtered options
    return filterOptions;
}
exports.filterOptions = filterOptions;
/**
 * Applies retryWrites: true to a command if retryWrites is set on the command's database.
 * @internal
 *
 * @param target - The target command to which we will apply retryWrites.
 * @param db - The database from which we can inherit a retryWrites value.
 */
function applyRetryableWrites(target, db) {
    var _a;
    if (db && ((_a = db.s.options) === null || _a === void 0 ? void 0 : _a.retryWrites)) {
        target.retryWrites = true;
    }
    return target;
}
exports.applyRetryableWrites = applyRetryableWrites;
/**
 * Applies a write concern to a command based on well defined inheritance rules, optionally
 * detecting support for the write concern in the first place.
 * @internal
 *
 * @param target - the target command we will be applying the write concern to
 * @param sources - sources where we can inherit default write concerns from
 * @param options - optional settings passed into a command for write concern overrides
 */
function applyWriteConcern(target, sources, options) {
    options = options !== null && options !== void 0 ? options : {};
    const db = sources.db;
    const coll = sources.collection;
    if (options.session && options.session.inTransaction()) {
        // writeConcern is not allowed within a multi-statement transaction
        if (target.writeConcern) {
            delete target.writeConcern;
        }
        return target;
    }
    const writeConcern = write_concern_1.WriteConcern.fromOptions(options);
    if (writeConcern) {
        return Object.assign(target, { writeConcern });
    }
    if (coll && coll.writeConcern) {
        return Object.assign(target, { writeConcern: Object.assign({}, coll.writeConcern) });
    }
    if (db && db.writeConcern) {
        return Object.assign(target, { writeConcern: Object.assign({}, db.writeConcern) });
    }
    return target;
}
exports.applyWriteConcern = applyWriteConcern;
/**
 * Checks if a given value is a Promise
 *
 * @typeParam T - The resolution type of the possible promise
 * @param value - An object that could be a promise
 * @returns true if the provided value is a Promise
 */
function isPromiseLike(value) {
    return !!value && typeof value.then === 'function';
}
exports.isPromiseLike = isPromiseLike;
/**
 * Applies collation to a given command.
 * @internal
 *
 * @param command - the command on which to apply collation
 * @param target - target of command
 * @param options - options containing collation settings
 */
function decorateWithCollation(command, target, options) {
    const capabilities = getTopology(target).capabilities;
    if (options.collation && typeof options.collation === 'object') {
        if (capabilities && capabilities.commandsTakeCollation) {
            command.collation = options.collation;
        }
        else {
            throw new error_1.MongoCompatibilityError(`Current topology does not support collation`);
        }
    }
}
exports.decorateWithCollation = decorateWithCollation;
/**
 * Applies a read concern to a given command.
 * @internal
 *
 * @param command - the command on which to apply the read concern
 * @param coll - the parent collection of the operation calling this method
 */
function decorateWithReadConcern(command, coll, options) {
    if (options && options.session && options.session.inTransaction()) {
        return;
    }
    const readConcern = Object.assign({}, command.readConcern || {});
    if (coll.s.readConcern) {
        Object.assign(readConcern, coll.s.readConcern);
    }
    if (Object.keys(readConcern).length > 0) {
        Object.assign(command, { readConcern: readConcern });
    }
}
exports.decorateWithReadConcern = decorateWithReadConcern;
/**
 * Applies an explain to a given command.
 * @internal
 *
 * @param command - the command on which to apply the explain
 * @param options - the options containing the explain verbosity
 */
function decorateWithExplain(command, explain) {
    if (command.explain) {
        return command;
    }
    return { explain: command, verbosity: explain.verbosity };
}
exports.decorateWithExplain = decorateWithExplain;
/**
 * A helper function to get the topology from a given provider. Throws
 * if the topology cannot be found.
 * @throws MongoNotConnectedError
 * @internal
 */
function getTopology(provider) {
    // MongoClient or ClientSession or AbstractCursor
    if ('topology' in provider && provider.topology) {
        return provider.topology;
    }
    else if ('s' in provider && 'client' in provider.s && provider.s.client.topology) {
        return provider.s.client.topology;
    }
    else if ('s' in provider && 'db' in provider.s && provider.s.db.s.client.topology) {
        return provider.s.db.s.client.topology;
    }
    throw new error_1.MongoNotConnectedError('MongoClient must be connected to perform this operation');
}
exports.getTopology = getTopology;
/**
 * Default message handler for generating deprecation warnings.
 * @internal
 *
 * @param name - function name
 * @param option - option name
 * @returns warning message
 */
function defaultMsgHandler(name, option) {
    return `${name} option [${option}] is deprecated and will be removed in a later version.`;
}
exports.defaultMsgHandler = defaultMsgHandler;
/**
 * Deprecates a given function's options.
 * @internal
 *
 * @param this - the bound class if this is a method
 * @param config - configuration for deprecation
 * @param fn - the target function of deprecation
 * @returns modified function that warns once per deprecated option, and executes original function
 */
function deprecateOptions(config, fn) {
    if (process.noDeprecation === true) {
        return fn;
    }
    const msgHandler = config.msgHandler ? config.msgHandler : defaultMsgHandler;
    const optionsWarned = new Set();
    function deprecated(...args) {
        const options = args[config.optionsIndex];
        // ensure options is a valid, non-empty object, otherwise short-circuit
        if (!isObject(options) || Object.keys(options).length === 0) {
            return fn.bind(this)(...args); // call the function, no change
        }
        // interrupt the function call with a warning
        for (const deprecatedOption of config.deprecatedOptions) {
            if (deprecatedOption in options && !optionsWarned.has(deprecatedOption)) {
                optionsWarned.add(deprecatedOption);
                const msg = msgHandler(config.name, deprecatedOption);
                emitWarning(msg);
                if (this && 'getLogger' in this) {
                    const logger = this.getLogger();
                    if (logger) {
                        logger.warn(msg);
                    }
                }
            }
        }
        return fn.bind(this)(...args);
    }
    // These lines copied from https://github.com/nodejs/node/blob/25e5ae41688676a5fd29b2e2e7602168eee4ceb5/lib/internal/util.js#L73-L80
    // The wrapper will keep the same prototype as fn to maintain prototype chain
    Object.setPrototypeOf(deprecated, fn);
    if (fn.prototype) {
        // Setting this (rather than using Object.setPrototype, as above) ensures
        // that calling the unwrapped constructor gives an instanceof the wrapped
        // constructor.
        deprecated.prototype = fn.prototype;
    }
    return deprecated;
}
exports.deprecateOptions = deprecateOptions;
/** @internal */
function ns(ns) {
    return MongoDBNamespace.fromString(ns);
}
exports.ns = ns;
/** @public */
class MongoDBNamespace {
    /**
     * Create a namespace object
     *
     * @param db - database name
     * @param collection - collection name
     */
    constructor(db, collection) {
        this.db = db;
        this.collection = collection === '' ? undefined : collection;
    }
    toString() {
        return this.collection ? `${this.db}.${this.collection}` : this.db;
    }
    withCollection(collection) {
        return new MongoDBNamespace(this.db, collection);
    }
    static fromString(namespace) {
        if (typeof namespace !== 'string' || namespace === '') {
            // TODO(NODE-3483): Replace with MongoNamespaceError
            throw new error_1.MongoRuntimeError(`Cannot parse namespace from "${namespace}"`);
        }
        const [db, ...collectionParts] = namespace.split('.');
        const collection = collectionParts.join('.');
        return new MongoDBNamespace(db, collection === '' ? undefined : collection);
    }
}
exports.MongoDBNamespace = MongoDBNamespace;
/** @internal */
function* makeCounter(seed = 0) {
    let count = seed;
    while (true) {
        const newCount = count;
        count += 1;
        yield newCount;
    }
}
exports.makeCounter = makeCounter;
function maybeCallback(promiseFn, callback) {
    const PromiseConstructor = promise_provider_1.PromiseProvider.get();
    const promise = promiseFn();
    if (callback == null) {
        if (PromiseConstructor == null) {
            return promise;
        }
        else {
            return new PromiseConstructor((resolve, reject) => {
                promise.then(resolve, reject);
            });
        }
    }
    promise.then(result => callback(undefined, result), error => callback(error));
    return;
}
exports.maybeCallback = maybeCallback;
/** @internal */
function databaseNamespace(ns) {
    return ns.split('.')[0];
}
exports.databaseNamespace = databaseNamespace;
/**
 * Synchronously Generate a UUIDv4
 * @internal
 */
function uuidV4() {
    const result = crypto.randomBytes(16);
    result[6] = (result[6] & 0x0f) | 0x40;
    result[8] = (result[8] & 0x3f) | 0x80;
    return result;
}
exports.uuidV4 = uuidV4;
/**
 * A helper function for determining `maxWireVersion` between legacy and new topology instances
 * @internal
 */
function maxWireVersion(topologyOrServer) {
    if (topologyOrServer) {
        if (topologyOrServer.loadBalanced) {
            // Since we do not have a monitor, we assume the load balanced server is always
            // pointed at the latest mongodb version. There is a risk that for on-prem
            // deployments that don't upgrade immediately that this could alert to the
            // application that a feature is available that is actually not.
            return constants_1.MAX_SUPPORTED_WIRE_VERSION;
        }
        if (topologyOrServer.hello) {
            return topologyOrServer.hello.maxWireVersion;
        }
        if ('lastHello' in topologyOrServer && typeof topologyOrServer.lastHello === 'function') {
            const lastHello = topologyOrServer.lastHello();
            if (lastHello) {
                return lastHello.maxWireVersion;
            }
        }
        if (topologyOrServer.description &&
            'maxWireVersion' in topologyOrServer.description &&
            topologyOrServer.description.maxWireVersion != null) {
            return topologyOrServer.description.maxWireVersion;
        }
    }
    return 0;
}
exports.maxWireVersion = maxWireVersion;
/**
 * Applies the function `eachFn` to each item in `arr`, in parallel.
 * @internal
 *
 * @param arr - An array of items to asynchronously iterate over
 * @param eachFn - A function to call on each item of the array. The callback signature is `(item, callback)`, where the callback indicates iteration is complete.
 * @param callback - The callback called after every item has been iterated
 */
function eachAsync(arr, eachFn, callback) {
    arr = arr || [];
    let idx = 0;
    let awaiting = 0;
    for (idx = 0; idx < arr.length; ++idx) {
        awaiting++;
        eachFn(arr[idx], eachCallback);
    }
    if (awaiting === 0) {
        callback();
        return;
    }
    function eachCallback(err) {
        awaiting--;
        if (err) {
            callback(err);
            return;
        }
        if (idx === arr.length && awaiting <= 0) {
            callback();
        }
    }
}
exports.eachAsync = eachAsync;
/** @internal */
function eachAsyncSeries(arr, eachFn, callback) {
    arr = arr || [];
    let idx = 0;
    let awaiting = arr.length;
    if (awaiting === 0) {
        callback();
        return;
    }
    function eachCallback(err) {
        idx++;
        awaiting--;
        if (err) {
            callback(err);
            return;
        }
        if (idx === arr.length && awaiting <= 0) {
            callback();
            return;
        }
        eachFn(arr[idx], eachCallback);
    }
    eachFn(arr[idx], eachCallback);
}
exports.eachAsyncSeries = eachAsyncSeries;
/** @internal */
function arrayStrictEqual(arr, arr2) {
    if (!Array.isArray(arr) || !Array.isArray(arr2)) {
        return false;
    }
    return arr.length === arr2.length && arr.every((elt, idx) => elt === arr2[idx]);
}
exports.arrayStrictEqual = arrayStrictEqual;
/** @internal */
function errorStrictEqual(lhs, rhs) {
    if (lhs === rhs) {
        return true;
    }
    if (!lhs || !rhs) {
        return lhs === rhs;
    }
    if ((lhs == null && rhs != null) || (lhs != null && rhs == null)) {
        return false;
    }
    if (lhs.constructor.name !== rhs.constructor.name) {
        return false;
    }
    if (lhs.message !== rhs.message) {
        return false;
    }
    return true;
}
exports.errorStrictEqual = errorStrictEqual;
/** @internal */
function makeStateMachine(stateTable) {
    return function stateTransition(target, newState) {
        const legalStates = stateTable[target.s.state];
        if (legalStates && legalStates.indexOf(newState) < 0) {
            throw new error_1.MongoRuntimeError(`illegal state transition from [${target.s.state}] => [${newState}], allowed: [${legalStates}]`);
        }
        target.emit('stateChanged', target.s.state, newState);
        target.s.state = newState;
    };
}
exports.makeStateMachine = makeStateMachine;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../package.json').version;
function makeClientMetadata(options) {
    options = options !== null && options !== void 0 ? options : {};
    const metadata = {
        driver: {
            name: 'nodejs',
            version: NODE_DRIVER_VERSION
        },
        os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
        },
        platform: `Node.js ${process.version}, ${os.endianness()} (unified)`
    };
    // support optionally provided wrapping driver info
    if (options.driverInfo) {
        if (options.driverInfo.name) {
            metadata.driver.name = `${metadata.driver.name}|${options.driverInfo.name}`;
        }
        if (options.driverInfo.version) {
            metadata.version = `${metadata.driver.version}|${options.driverInfo.version}`;
        }
        if (options.driverInfo.platform) {
            metadata.platform = `${metadata.platform}|${options.driverInfo.platform}`;
        }
    }
    if (options.appName) {
        // MongoDB requires the appName not exceed a byte length of 128
        const buffer = Buffer.from(options.appName);
        metadata.application = {
            name: buffer.byteLength > 128 ? buffer.slice(0, 128).toString('utf8') : options.appName
        };
    }
    return metadata;
}
exports.makeClientMetadata = makeClientMetadata;
/** @internal */
function now() {
    const hrtime = process.hrtime();
    return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}
exports.now = now;
/** @internal */
function calculateDurationInMs(started) {
    if (typeof started !== 'number') {
        throw new error_1.MongoInvalidArgumentError('Numeric value required to calculate duration');
    }
    const elapsed = now() - started;
    return elapsed < 0 ? 0 : elapsed;
}
exports.calculateDurationInMs = calculateDurationInMs;
/** @internal */
function hasAtomicOperators(doc) {
    if (Array.isArray(doc)) {
        for (const document of doc) {
            if (hasAtomicOperators(document)) {
                return true;
            }
        }
        return false;
    }
    const keys = Object.keys(doc);
    return keys.length > 0 && keys[0][0] === '$';
}
exports.hasAtomicOperators = hasAtomicOperators;
/**
 * Merge inherited properties from parent into options, prioritizing values from options,
 * then values from parent.
 * @internal
 */
function resolveOptions(parent, options) {
    var _a, _b, _c;
    const result = Object.assign({}, options, (0, bson_1.resolveBSONOptions)(options, parent));
    // Users cannot pass a readConcern/writeConcern to operations in a transaction
    const session = options === null || options === void 0 ? void 0 : options.session;
    if (!(session === null || session === void 0 ? void 0 : session.inTransaction())) {
        const readConcern = (_a = read_concern_1.ReadConcern.fromOptions(options)) !== null && _a !== void 0 ? _a : parent === null || parent === void 0 ? void 0 : parent.readConcern;
        if (readConcern) {
            result.readConcern = readConcern;
        }
        const writeConcern = (_b = write_concern_1.WriteConcern.fromOptions(options)) !== null && _b !== void 0 ? _b : parent === null || parent === void 0 ? void 0 : parent.writeConcern;
        if (writeConcern) {
            result.writeConcern = writeConcern;
        }
    }
    const readPreference = (_c = read_preference_1.ReadPreference.fromOptions(options)) !== null && _c !== void 0 ? _c : parent === null || parent === void 0 ? void 0 : parent.readPreference;
    if (readPreference) {
        result.readPreference = readPreference;
    }
    return result;
}
exports.resolveOptions = resolveOptions;
function isSuperset(set, subset) {
    set = Array.isArray(set) ? new Set(set) : set;
    subset = Array.isArray(subset) ? new Set(subset) : subset;
    for (const elem of subset) {
        if (!set.has(elem)) {
            return false;
        }
    }
    return true;
}
exports.isSuperset = isSuperset;
/**
 * Checks if the document is a Hello request
 * @internal
 */
function isHello(doc) {
    return doc[constants_2.LEGACY_HELLO_COMMAND] || doc.hello ? true : false;
}
exports.isHello = isHello;
/** Returns the items that are uniquely in setA */
function setDifference(setA, setB) {
    const difference = new Set(setA);
    for (const elem of setB) {
        difference.delete(elem);
    }
    return difference;
}
exports.setDifference = setDifference;
const HAS_OWN = (object, prop) => Object.prototype.hasOwnProperty.call(object, prop);
function isRecord(value, requiredKeys = undefined) {
    if (!isObject(value)) {
        return false;
    }
    const ctor = value.constructor;
    if (ctor && ctor.prototype) {
        if (!isObject(ctor.prototype)) {
            return false;
        }
        // Check to see if some method exists from the Object exists
        if (!HAS_OWN(ctor.prototype, 'isPrototypeOf')) {
            return false;
        }
    }
    if (requiredKeys) {
        const keys = Object.keys(value);
        return isSuperset(keys, requiredKeys);
    }
    return true;
}
exports.isRecord = isRecord;
/**
 * Make a deep copy of an object
 *
 * NOTE: This is not meant to be the perfect implementation of a deep copy,
 * but instead something that is good enough for the purposes of
 * command monitoring.
 */
function deepCopy(value) {
    if (value == null) {
        return value;
    }
    else if (Array.isArray(value)) {
        return value.map(item => deepCopy(item));
    }
    else if (isRecord(value)) {
        const res = {};
        for (const key in value) {
            res[key] = deepCopy(value[key]);
        }
        return res;
    }
    const ctor = value.constructor;
    if (ctor) {
        switch (ctor.name.toLowerCase()) {
            case 'date':
                return new ctor(Number(value));
            case 'map':
                return new Map(value);
            case 'set':
                return new Set(value);
            case 'buffer':
                return Buffer.from(value);
        }
    }
    return value;
}
exports.deepCopy = deepCopy;
/**
 * A sequential list of items in a circularly linked list
 * @remarks
 * The head node is special, it is always defined and has a value of null.
 * It is never "included" in the list, in that, it is not returned by pop/shift or yielded by the iterator.
 * The circular linkage and always defined head node are to reduce checks for null next/prev references to zero.
 * New nodes are declared as object literals with keys always in the same order: next, prev, value.
 * @internal
 */
class List {
    constructor() {
        this.count = 0;
        // this is carefully crafted:
        // declaring a complete and consistently key ordered
        // object is beneficial to the runtime optimizations
        this.head = {
            next: null,
            prev: null,
            value: null
        };
        this.head.next = this.head;
        this.head.prev = this.head;
    }
    get length() {
        return this.count;
    }
    get [Symbol.toStringTag]() {
        return 'List';
    }
    toArray() {
        return Array.from(this);
    }
    toString() {
        return `head <=> ${this.toArray().join(' <=> ')} <=> head`;
    }
    *[Symbol.iterator]() {
        for (const node of this.nodes()) {
            yield node.value;
        }
    }
    *nodes() {
        let ptr = this.head.next;
        while (ptr !== this.head) {
            // Save next before yielding so that we make removing within iteration safe
            const { next } = ptr;
            yield ptr;
            ptr = next;
        }
    }
    /** Insert at end of list */
    push(value) {
        this.count += 1;
        const newNode = {
            next: this.head,
            prev: this.head.prev,
            value
        };
        this.head.prev.next = newNode;
        this.head.prev = newNode;
    }
    /** Inserts every item inside an iterable instead of the iterable itself */
    pushMany(iterable) {
        for (const value of iterable) {
            this.push(value);
        }
    }
    /** Insert at front of list */
    unshift(value) {
        this.count += 1;
        const newNode = {
            next: this.head.next,
            prev: this.head,
            value
        };
        this.head.next.prev = newNode;
        this.head.next = newNode;
    }
    remove(node) {
        if (node === this.head || this.length === 0) {
            return null;
        }
        this.count -= 1;
        const prevNode = node.prev;
        const nextNode = node.next;
        prevNode.next = nextNode;
        nextNode.prev = prevNode;
        return node.value;
    }
    /** Removes the first node at the front of the list */
    shift() {
        return this.remove(this.head.next);
    }
    /** Removes the last node at the end of the list */
    pop() {
        return this.remove(this.head.prev);
    }
    /** Iterates through the list and removes nodes where filter returns true */
    prune(filter) {
        for (const node of this.nodes()) {
            if (filter(node.value)) {
                this.remove(node);
            }
        }
    }
    clear() {
        this.count = 0;
        this.head.next = this.head;
        this.head.prev = this.head;
    }
    /** Returns the first item in the list, does not remove */
    first() {
        // If the list is empty, value will be the head's null
        return this.head.next.value;
    }
    /** Returns the last item in the list, does not remove */
    last() {
        // If the list is empty, value will be the head's null
        return this.head.prev.value;
    }
}
exports.List = List;
/**
 * A pool of Buffers which allow you to read them as if they were one
 * @internal
 */
class BufferPool {
    constructor() {
        this.buffers = new List();
        this.totalByteLength = 0;
    }
    get length() {
        return this.totalByteLength;
    }
    /** Adds a buffer to the internal buffer pool list */
    append(buffer) {
        this.buffers.push(buffer);
        this.totalByteLength += buffer.length;
    }
    /**
     * If BufferPool contains 4 bytes or more construct an int32 from the leading bytes,
     * otherwise return null. Size can be negative, caller should error check.
     */
    getInt32() {
        if (this.totalByteLength < 4) {
            return null;
        }
        const firstBuffer = this.buffers.first();
        if (firstBuffer != null && firstBuffer.byteLength >= 4) {
            return firstBuffer.readInt32LE(0);
        }
        // Unlikely case: an int32 is split across buffers.
        // Use read and put the returned buffer back on top
        const top4Bytes = this.read(4);
        const value = top4Bytes.readInt32LE(0);
        // Put it back.
        this.totalByteLength += 4;
        this.buffers.unshift(top4Bytes);
        return value;
    }
    /** Reads the requested number of bytes, optionally consuming them */
    read(size) {
        if (typeof size !== 'number' || size < 0) {
            throw new error_1.MongoInvalidArgumentError('Argument "size" must be a non-negative number');
        }
        // oversized request returns empty buffer
        if (size > this.totalByteLength) {
            return Buffer.alloc(0);
        }
        // We know we have enough, we just don't know how it is spread across chunks
        // TODO(NODE-4732): alloc API should change based on raw option
        const result = Buffer.allocUnsafe(size);
        for (let bytesRead = 0; bytesRead < size;) {
            const buffer = this.buffers.shift();
            if (buffer == null) {
                break;
            }
            const bytesRemaining = size - bytesRead;
            const bytesReadable = Math.min(bytesRemaining, buffer.byteLength);
            const bytes = buffer.subarray(0, bytesReadable);
            result.set(bytes, bytesRead);
            bytesRead += bytesReadable;
            this.totalByteLength -= bytesReadable;
            if (bytesReadable < buffer.byteLength) {
                this.buffers.unshift(buffer.subarray(bytesReadable));
            }
        }
        return result;
    }
}
exports.BufferPool = BufferPool;
/** @public */
class HostAddress {
    constructor(hostString) {
        this.host = undefined;
        this.port = undefined;
        this.socketPath = undefined;
        this.isIPv6 = false;
        const escapedHost = hostString.split(' ').join('%20'); // escape spaces, for socket path hosts
        if (escapedHost.endsWith('.sock')) {
            // heuristically determine if we're working with a domain socket
            this.socketPath = decodeURIComponent(escapedHost);
            return;
        }
        const urlString = `iLoveJS://${escapedHost}`;
        let url;
        try {
            url = new url_1.URL(urlString);
        }
        catch (urlError) {
            const runtimeError = new error_1.MongoRuntimeError(`Unable to parse ${escapedHost} with URL`);
            runtimeError.cause = urlError;
            throw runtimeError;
        }
        const hostname = url.hostname;
        const port = url.port;
        let normalized = decodeURIComponent(hostname).toLowerCase();
        if (normalized.startsWith('[') && normalized.endsWith(']')) {
            this.isIPv6 = true;
            normalized = normalized.substring(1, hostname.length - 1);
        }
        this.host = normalized.toLowerCase();
        if (typeof port === 'number') {
            this.port = port;
        }
        else if (typeof port === 'string' && port !== '') {
            this.port = Number.parseInt(port, 10);
        }
        else {
            this.port = 27017;
        }
        if (this.port === 0) {
            throw new error_1.MongoParseError('Invalid port (zero) with hostname');
        }
        Object.freeze(this);
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.inspect();
    }
    inspect() {
        return `new HostAddress('${this.toString()}')`;
    }
    toString() {
        if (typeof this.host === 'string') {
            if (this.isIPv6) {
                return `[${this.host}]:${this.port}`;
            }
            return `${this.host}:${this.port}`;
        }
        return `${this.socketPath}`;
    }
    static fromString(s) {
        return new HostAddress(s);
    }
    static fromHostPort(host, port) {
        if (host.includes(':')) {
            host = `[${host}]`; // IPv6 address
        }
        return HostAddress.fromString(`${host}:${port}`);
    }
    static fromSrvRecord({ name, port }) {
        return HostAddress.fromHostPort(name, port);
    }
}
exports.HostAddress = HostAddress;
exports.DEFAULT_PK_FACTORY = {
    // We prefer not to rely on ObjectId having a createPk method
    createPk() {
        return new bson_1.ObjectId();
    }
};
/**
 * When the driver used emitWarning the code will be equal to this.
 * @public
 *
 * @example
 * ```ts
 * process.on('warning', (warning) => {
 *  if (warning.code === MONGODB_WARNING_CODE) console.error('Ah an important warning! :)')
 * })
 * ```
 */
exports.MONGODB_WARNING_CODE = 'MONGODB DRIVER';
/** @internal */
function emitWarning(message) {
    return process.emitWarning(message, { code: exports.MONGODB_WARNING_CODE });
}
exports.emitWarning = emitWarning;
const emittedWarnings = new Set();
/**
 * Will emit a warning once for the duration of the application.
 * Uses the message to identify if it has already been emitted
 * so using string interpolation can cause multiple emits
 * @internal
 */
function emitWarningOnce(message) {
    if (!emittedWarnings.has(message)) {
        emittedWarnings.add(message);
        return emitWarning(message);
    }
}
exports.emitWarningOnce = emitWarningOnce;
/**
 * Takes a JS object and joins the values into a string separated by ', '
 */
function enumToString(en) {
    return Object.values(en).join(', ');
}
exports.enumToString = enumToString;
/**
 * Determine if a server supports retryable writes.
 *
 * @internal
 */
function supportsRetryableWrites(server) {
    if (!server) {
        return false;
    }
    if (server.loadBalanced) {
        // Loadbalanced topologies will always support retry writes
        return true;
    }
    if (server.description.logicalSessionTimeoutMinutes != null) {
        // that supports sessions
        if (server.description.type !== common_1.ServerType.Standalone) {
            // and that is not a standalone
            return true;
        }
    }
    return false;
}
exports.supportsRetryableWrites = supportsRetryableWrites;
function parsePackageVersion({ version }) {
    const [major, minor, patch] = version.split('.').map((n) => Number.parseInt(n, 10));
    return { major, minor, patch };
}
exports.parsePackageVersion = parsePackageVersion;
/**
 * Fisher–Yates Shuffle
 *
 * Reference: https://bost.ocks.org/mike/shuffle/
 * @param sequence - items to be shuffled
 * @param limit - Defaults to `0`. If nonzero shuffle will slice the randomized array e.g, `.slice(0, limit)` otherwise will return the entire randomized array.
 */
function shuffle(sequence, limit = 0) {
    const items = Array.from(sequence); // shallow copy in order to never shuffle the input
    if (limit > items.length) {
        throw new error_1.MongoRuntimeError('Limit must be less than the number of items');
    }
    let remainingItemsToShuffle = items.length;
    const lowerBound = limit % items.length === 0 ? 1 : items.length - limit;
    while (remainingItemsToShuffle > lowerBound) {
        // Pick a remaining element
        const randomIndex = Math.floor(Math.random() * remainingItemsToShuffle);
        remainingItemsToShuffle -= 1;
        // And swap it with the current element
        const swapHold = items[remainingItemsToShuffle];
        items[remainingItemsToShuffle] = items[randomIndex];
        items[randomIndex] = swapHold;
    }
    return limit % items.length === 0 ? items : items.slice(lowerBound);
}
exports.shuffle = shuffle;
// TODO: this should be codified in command construction
// @see https://github.com/mongodb/specifications/blob/master/source/read-write-concern/read-write-concern.rst#read-concern
function commandSupportsReadConcern(command, options) {
    if (command.aggregate || command.count || command.distinct || command.find || command.geoNear) {
        return true;
    }
    if (command.mapReduce &&
        options &&
        options.out &&
        (options.out.inline === 1 || options.out === 'inline')) {
        return true;
    }
    return false;
}
exports.commandSupportsReadConcern = commandSupportsReadConcern;
/** A utility function to get the instance of mongodb-client-encryption, if it exists. */
function getMongoDBClientEncryption() {
    let mongodbClientEncryption = null;
    // NOTE(NODE-4254): This is to get around the circular dependency between
    // mongodb-client-encryption and the driver in the test scenarios.
    if (typeof process.env.MONGODB_CLIENT_ENCRYPTION_OVERRIDE === 'string' &&
        process.env.MONGODB_CLIENT_ENCRYPTION_OVERRIDE.length > 0) {
        try {
            // NOTE(NODE-3199): Ensure you always wrap an optional require literally in the try block
            // Cannot be moved to helper utility function, bundlers search and replace the actual require call
            // in a way that makes this line throw at bundle time, not runtime, catching here will make bundling succeed
            mongodbClientEncryption = require(process.env.MONGODB_CLIENT_ENCRYPTION_OVERRIDE);
        }
        catch {
            // ignore
        }
    }
    else {
        try {
            // NOTE(NODE-3199): Ensure you always wrap an optional require literally in the try block
            // Cannot be moved to helper utility function, bundlers search and replace the actual require call
            // in a way that makes this line throw at bundle time, not runtime, catching here will make bundling succeed
            mongodbClientEncryption = require('mongodb-client-encryption');
        }
        catch {
            // ignore
        }
    }
    return mongodbClientEncryption;
}
exports.getMongoDBClientEncryption = getMongoDBClientEncryption;
/**
 * Compare objectIds. `null` is always less
 * - `+1 = oid1 is greater than oid2`
 * - `-1 = oid1 is less than oid2`
 * - `+0 = oid1 is equal oid2`
 */
function compareObjectId(oid1, oid2) {
    if (oid1 == null && oid2 == null) {
        return 0;
    }
    if (oid1 == null) {
        return -1;
    }
    if (oid2 == null) {
        return 1;
    }
    return exports.ByteUtils.compare(oid1.id, oid2.id);
}
exports.compareObjectId = compareObjectId;
function parseInteger(value) {
    if (typeof value === 'number')
        return Math.trunc(value);
    const parsedValue = Number.parseInt(String(value), 10);
    return Number.isNaN(parsedValue) ? null : parsedValue;
}
exports.parseInteger = parseInteger;
function parseUnsignedInteger(value) {
    const parsedInt = parseInteger(value);
    return parsedInt != null && parsedInt >= 0 ? parsedInt : null;
}
exports.parseUnsignedInteger = parseUnsignedInteger;
//# sourceMappingURL=utils.js.map