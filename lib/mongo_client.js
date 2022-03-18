"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoClient = exports.ServerApiVersion = void 0;
const bson_1 = require("./bson");
const change_stream_1 = require("./change_stream");
const connection_string_1 = require("./connection_string");
const db_1 = require("./db");
const error_1 = require("./error");
const mongo_types_1 = require("./mongo_types");
const connect_1 = require("./operations/connect");
const promise_provider_1 = require("./promise_provider");
const utils_1 = require("./utils");
/** @public */
exports.ServerApiVersion = Object.freeze({
    v1: '1'
});
/** @internal */
const kOptions = Symbol('options');
/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 * @public
 *
 * @remarks
 * The programmatically provided options take precedent over the URI options.
 *
 * @example
 * ```js
 * // Connect using a MongoClient instance
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * const mongoClient = new MongoClient(url);
 * mongoClient.connect(function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 *
 * @example
 * ```js
 * // Connect using the MongoClient.connect static method
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 */
class MongoClient extends mongo_types_1.TypedEventEmitter {
    constructor(url, options) {
        super();
        this[kOptions] = (0, connection_string_1.parseOptions)(url, this, options);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const client = this;
        // The internal state
        this.s = {
            url,
            sessions: new Set(),
            bsonOptions: (0, bson_1.resolveBSONOptions)(this[kOptions]),
            namespace: (0, utils_1.ns)('admin'),
            get options() {
                return client[kOptions];
            },
            get readConcern() {
                return client[kOptions].readConcern;
            },
            get writeConcern() {
                return client[kOptions].writeConcern;
            },
            get readPreference() {
                return client[kOptions].readPreference;
            },
            get logger() {
                return client[kOptions].logger;
            }
        };
    }
    get options() {
        return Object.freeze({ ...this[kOptions] });
    }
    get serverApi() {
        return this[kOptions].serverApi && Object.freeze({ ...this[kOptions].serverApi });
    }
    /**
     * Intended for APM use only
     * @internal
     */
    get monitorCommands() {
        return this[kOptions].monitorCommands;
    }
    set monitorCommands(value) {
        this[kOptions].monitorCommands = value;
    }
    get autoEncrypter() {
        return this[kOptions].autoEncrypter;
    }
    get readConcern() {
        return this.s.readConcern;
    }
    get writeConcern() {
        return this.s.writeConcern;
    }
    get readPreference() {
        return this.s.readPreference;
    }
    get bsonOptions() {
        return this.s.bsonOptions;
    }
    get logger() {
        return this.s.logger;
    }
    connect(callback) {
        if (callback && typeof callback !== 'function') {
            throw new error_1.MongoInvalidArgumentError('Method `connect` only accepts a callback');
        }
        return (0, utils_1.maybePromise)(callback, cb => {
            (0, connect_1.connect)(this, this[kOptions], err => {
                if (err)
                    return cb(err);
                cb(undefined, this);
            });
        });
    }
    close(forceOrCallback, callback) {
        if (typeof forceOrCallback === 'function') {
            callback = forceOrCallback;
        }
        const force = typeof forceOrCallback === 'boolean' ? forceOrCallback : false;
        return (0, utils_1.maybePromise)(callback, callback => {
            if (this.topology == null) {
                return callback();
            }
            // clear out references to old topology
            const topology = this.topology;
            this.topology = undefined;
            topology.close({ force }, error => {
                if (error)
                    return callback(error);
                const { encrypter } = this[kOptions];
                if (encrypter) {
                    return encrypter.close(this, force, error => {
                        callback(error);
                    });
                }
                callback();
            });
        });
    }
    /**
     * Create a new Db instance sharing the current socket connections.
     *
     * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
     * @param options - Optional settings for Db construction
     */
    db(dbName, options) {
        options = options !== null && options !== void 0 ? options : {};
        // Default to db from connection string if not provided
        if (!dbName) {
            dbName = this.options.dbName;
        }
        // Copy the options and add out internal override of the not shared flag
        const finalOptions = Object.assign({}, this[kOptions], options);
        // Return the db object
        const db = new db_1.Db(this, dbName, finalOptions);
        // Return the database
        return db;
    }
    static connect(url, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        try {
            // Create client
            const mongoClient = new MongoClient(url, options);
            // Execute the connect method
            if (callback) {
                return mongoClient.connect(callback);
            }
            else {
                return mongoClient.connect();
            }
        }
        catch (error) {
            if (callback)
                return callback(error);
            else
                return promise_provider_1.PromiseProvider.get().reject(error);
        }
    }
    startSession(options) {
        options = Object.assign({ explicit: true }, options);
        if (!this.topology) {
            throw new error_1.MongoNotConnectedError('MongoClient must be connected to start a session');
        }
        return this.topology.startSession(options, this.s.options);
    }
    withSession(optionsOrOperation, callback) {
        const options = {
            // Always define an owner
            owner: Symbol(),
            // If it's an object inherit the options
            ...(typeof optionsOrOperation === 'object' ? optionsOrOperation : {})
        };
        const withSessionCallback = typeof optionsOrOperation === 'function' ? optionsOrOperation : callback;
        if (withSessionCallback == null) {
            throw new error_1.MongoInvalidArgumentError('Missing required callback parameter');
        }
        const session = this.startSession(options);
        const Promise = promise_provider_1.PromiseProvider.get();
        return Promise.resolve()
            .then(() => withSessionCallback(session))
            .then(() => {
            // Do not return the result of callback
        })
            .finally(() => session.endSession());
    }
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates,
     * replacements, deletions, and invalidations) in this cluster. Will ignore all
     * changes to system collections, as well as the local, admin, and config databases.
     *
     * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
     * @param options - Optional settings for the command
     */
    watch(pipeline = [], options = {}) {
        // Allow optionally not specifying a pipeline
        if (!Array.isArray(pipeline)) {
            options = pipeline;
            pipeline = [];
        }
        return new change_stream_1.ChangeStream(this, pipeline, (0, utils_1.resolveOptions)(this, options));
    }
    /** Return the mongo client logger */
    getLogger() {
        return this.s.logger;
    }
}
exports.MongoClient = MongoClient;
//# sourceMappingURL=mongo_client.js.map