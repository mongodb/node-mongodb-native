"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = void 0;
const admin_1 = require("./admin");
const bson_1 = require("./bson");
const change_stream_1 = require("./change_stream");
const collection_1 = require("./collection");
const CONSTANTS = require("./constants");
const aggregation_cursor_1 = require("./cursor/aggregation_cursor");
const error_1 = require("./error");
const logger_1 = require("./logger");
const add_user_1 = require("./operations/add_user");
const collections_1 = require("./operations/collections");
const create_collection_1 = require("./operations/create_collection");
const drop_1 = require("./operations/drop");
const execute_operation_1 = require("./operations/execute_operation");
const indexes_1 = require("./operations/indexes");
const list_collections_1 = require("./operations/list_collections");
const profiling_level_1 = require("./operations/profiling_level");
const remove_user_1 = require("./operations/remove_user");
const rename_1 = require("./operations/rename");
const run_command_1 = require("./operations/run_command");
const set_profiling_level_1 = require("./operations/set_profiling_level");
const stats_1 = require("./operations/stats");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const utils_1 = require("./utils");
const write_concern_1 = require("./write_concern");
// Allowed parameters
const DB_OPTIONS_ALLOW_LIST = [
    'writeConcern',
    'readPreference',
    'readPreferenceTags',
    'native_parser',
    'forceServerObjectId',
    'pkFactory',
    'serializeFunctions',
    'raw',
    'authSource',
    'ignoreUndefined',
    'readConcern',
    'retryMiliSeconds',
    'numberOfRetries',
    'loggerLevel',
    'logger',
    'promoteBuffers',
    'promoteLongs',
    'bsonRegExp',
    'enableUtf8Validation',
    'promoteValues',
    'compression',
    'retryWrites'
];
/**
 * The **Db** class is a class that represents a MongoDB Database.
 * @public
 *
 * @example
 * ```js
 * const { MongoClient } = require('mongodb');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Select the database by name
 *   const testDb = client.db(dbName);
 *   client.close();
 * });
 * ```
 */
class Db {
    /**
     * Creates a new Db instance
     *
     * @param client - The MongoClient for the database.
     * @param databaseName - The name of the database this instance represents.
     * @param options - Optional settings for Db construction
     */
    constructor(client, databaseName, options) {
        var _a;
        options = options !== null && options !== void 0 ? options : {};
        // Filter the options
        options = (0, utils_1.filterOptions)(options, DB_OPTIONS_ALLOW_LIST);
        // Ensure we have a valid db name
        validateDatabaseName(databaseName);
        // Internal state of the db object
        this.s = {
            // Client
            client,
            // Options
            options,
            // Logger instance
            logger: new logger_1.Logger('Db', options),
            // Unpack read preference
            readPreference: read_preference_1.ReadPreference.fromOptions(options),
            // Merge bson options
            bsonOptions: (0, bson_1.resolveBSONOptions)(options, client),
            // Set up the primary key factory or fallback to ObjectId
            pkFactory: (_a = options === null || options === void 0 ? void 0 : options.pkFactory) !== null && _a !== void 0 ? _a : utils_1.DEFAULT_PK_FACTORY,
            // ReadConcern
            readConcern: read_concern_1.ReadConcern.fromOptions(options),
            writeConcern: write_concern_1.WriteConcern.fromOptions(options),
            // Namespace
            namespace: new utils_1.MongoDBNamespace(databaseName)
        };
    }
    get databaseName() {
        return this.s.namespace.db;
    }
    // Options
    get options() {
        return this.s.options;
    }
    /**
     * slaveOk specified
     * @deprecated Use secondaryOk instead
     */
    get slaveOk() {
        return this.secondaryOk;
    }
    /**
     * Check if a secondary can be used (because the read preference is *not* set to primary)
     */
    get secondaryOk() {
        var _a;
        return ((_a = this.s.readPreference) === null || _a === void 0 ? void 0 : _a.preference) !== 'primary' || false;
    }
    get readConcern() {
        return this.s.readConcern;
    }
    /**
     * The current readPreference of the Db. If not explicitly defined for
     * this Db, will be inherited from the parent MongoClient
     */
    get readPreference() {
        if (this.s.readPreference == null) {
            return this.s.client.readPreference;
        }
        return this.s.readPreference;
    }
    get bsonOptions() {
        return this.s.bsonOptions;
    }
    // get the write Concern
    get writeConcern() {
        return this.s.writeConcern;
    }
    get namespace() {
        return this.s.namespace.toString();
    }
    createCollection(name, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new create_collection_1.CreateCollectionOperation(this, name, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    command(command, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        // Intentionally, we do not inherit options from parent for this operation.
        return (0, execute_operation_1.executeOperation)(this, new run_command_1.RunCommandOperation(this, command, options !== null && options !== void 0 ? options : {}), callback);
    }
    /**
     * Execute an aggregation framework pipeline against the database, needs MongoDB \>= 3.6
     *
     * @param pipeline - An array of aggregation stages to be executed
     * @param options - Optional settings for the command
     */
    aggregate(pipeline = [], options) {
        if (arguments.length > 2) {
            throw new error_1.MongoInvalidArgumentError('Method "db.aggregate()" accepts at most two arguments');
        }
        if (typeof pipeline === 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "pipeline" must not be function');
        }
        if (typeof options === 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "options" must not be function');
        }
        return new aggregation_cursor_1.AggregationCursor((0, utils_1.getTopology)(this), this.s.namespace, pipeline, (0, utils_1.resolveOptions)(this, options));
    }
    /** Return the Admin db instance */
    admin() {
        return new admin_1.Admin(this);
    }
    /**
     * Returns a reference to a MongoDB Collection. If it does not exist it will be created implicitly.
     *
     * @param name - the collection name we wish to access.
     * @returns return the new Collection instance
     */
    collection(name, options = {}) {
        if (typeof options === 'function') {
            throw new error_1.MongoInvalidArgumentError('The callback form of this helper has been removed.');
        }
        const finalOptions = (0, utils_1.resolveOptions)(this, options);
        return new collection_1.Collection(this, name, finalOptions);
    }
    stats(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new stats_1.DbStatsOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    listCollections(filter = {}, options = {}) {
        return new list_collections_1.ListCollectionsCursor(this, filter, (0, utils_1.resolveOptions)(this, options));
    }
    renameCollection(fromCollection, toCollection, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        // Intentionally, we do not inherit options from parent for this operation.
        options = { ...options, readPreference: read_preference_1.ReadPreference.PRIMARY };
        // Add return new collection
        options.new_collection = true;
        return (0, execute_operation_1.executeOperation)(this, new rename_1.RenameOperation(this.collection(fromCollection), toCollection, options), callback);
    }
    dropCollection(name, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new drop_1.DropCollectionOperation(this, name, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    dropDatabase(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new drop_1.DropDatabaseOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    collections(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new collections_1.CollectionsOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    createIndex(name, indexSpec, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.CreateIndexOperation(this, name, indexSpec, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    addUser(username, password, options, callback) {
        if (typeof password === 'function') {
            (callback = password), (password = undefined), (options = {});
        }
        else if (typeof password !== 'string') {
            if (typeof options === 'function') {
                (callback = options), (options = password), (password = undefined);
            }
            else {
                (options = password), (callback = undefined), (password = undefined);
            }
        }
        else {
            if (typeof options === 'function')
                (callback = options), (options = {});
        }
        return (0, execute_operation_1.executeOperation)(this, new add_user_1.AddUserOperation(this, username, password, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    removeUser(username, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new remove_user_1.RemoveUserOperation(this, username, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    setProfilingLevel(level, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new set_profiling_level_1.SetProfilingLevelOperation(this, level, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    profilingLevel(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new profiling_level_1.ProfilingLevelOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    indexInformation(name, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.IndexInformationOperation(this, name, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    /**
     * Unref all sockets
     * @deprecated This function is deprecated and will be removed in the next major version.
     */
    unref() {
        (0, utils_1.getTopology)(this).unref();
    }
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates,
     * replacements, deletions, and invalidations) in this database. Will ignore all
     * changes to system collections.
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
    /** Return the db logger */
    getLogger() {
        return this.s.logger;
    }
    get logger() {
        return this.s.logger;
    }
}
exports.Db = Db;
Db.SYSTEM_NAMESPACE_COLLECTION = CONSTANTS.SYSTEM_NAMESPACE_COLLECTION;
Db.SYSTEM_INDEX_COLLECTION = CONSTANTS.SYSTEM_INDEX_COLLECTION;
Db.SYSTEM_PROFILE_COLLECTION = CONSTANTS.SYSTEM_PROFILE_COLLECTION;
Db.SYSTEM_USER_COLLECTION = CONSTANTS.SYSTEM_USER_COLLECTION;
Db.SYSTEM_COMMAND_COLLECTION = CONSTANTS.SYSTEM_COMMAND_COLLECTION;
Db.SYSTEM_JS_COLLECTION = CONSTANTS.SYSTEM_JS_COLLECTION;
// TODO(NODE-3484): Refactor into MongoDBNamespace
// Validate the database name
function validateDatabaseName(databaseName) {
    if (typeof databaseName !== 'string')
        throw new error_1.MongoInvalidArgumentError('Database name must be a string');
    if (databaseName.length === 0)
        throw new error_1.MongoInvalidArgumentError('Database name cannot be the empty string');
    if (databaseName === '$external')
        return;
    const invalidChars = [' ', '.', '$', '/', '\\'];
    for (let i = 0; i < invalidChars.length; i++) {
        if (databaseName.indexOf(invalidChars[i]) !== -1)
            throw new error_1.MongoAPIError(`database names cannot contain the character '${invalidChars[i]}'`);
    }
}
//# sourceMappingURL=db.js.map