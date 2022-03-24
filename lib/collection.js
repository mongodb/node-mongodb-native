"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Collection = void 0;
const bson_1 = require("./bson");
const ordered_1 = require("./bulk/ordered");
const unordered_1 = require("./bulk/unordered");
const change_stream_1 = require("./change_stream");
const aggregation_cursor_1 = require("./cursor/aggregation_cursor");
const find_cursor_1 = require("./cursor/find_cursor");
const error_1 = require("./error");
const bulk_write_1 = require("./operations/bulk_write");
const count_1 = require("./operations/count");
const count_documents_1 = require("./operations/count_documents");
const delete_1 = require("./operations/delete");
const distinct_1 = require("./operations/distinct");
const drop_1 = require("./operations/drop");
const estimated_document_count_1 = require("./operations/estimated_document_count");
const execute_operation_1 = require("./operations/execute_operation");
const find_and_modify_1 = require("./operations/find_and_modify");
const indexes_1 = require("./operations/indexes");
const insert_1 = require("./operations/insert");
const is_capped_1 = require("./operations/is_capped");
const map_reduce_1 = require("./operations/map_reduce");
const options_operation_1 = require("./operations/options_operation");
const rename_1 = require("./operations/rename");
const stats_1 = require("./operations/stats");
const update_1 = require("./operations/update");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const utils_1 = require("./utils");
const write_concern_1 = require("./write_concern");
/**
 * The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/update/remove/find and other command operation on that MongoDB collection.
 *
 * **COLLECTION Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```js
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('createIndexExample1');
 *   // Show that duplicate records got dropped
 *   col.find({}).toArray(function(err, items) {
 *     expect(err).to.not.exist;
 *     test.equal(4, items.length);
 *     client.close();
 *   });
 * });
 * ```
 */
class Collection {
    /**
     * Create a new Collection instance
     * @internal
     */
    constructor(db, name, options) {
        var _a, _b;
        (0, utils_1.checkCollectionName)(name);
        // Internal state
        this.s = {
            db,
            options,
            namespace: new utils_1.MongoDBNamespace(db.databaseName, name),
            pkFactory: (_b = (_a = db.options) === null || _a === void 0 ? void 0 : _a.pkFactory) !== null && _b !== void 0 ? _b : utils_1.DEFAULT_PK_FACTORY,
            readPreference: read_preference_1.ReadPreference.fromOptions(options),
            bsonOptions: (0, bson_1.resolveBSONOptions)(options, db),
            readConcern: read_concern_1.ReadConcern.fromOptions(options),
            writeConcern: write_concern_1.WriteConcern.fromOptions(options)
        };
    }
    /**
     * The name of the database this collection belongs to
     */
    get dbName() {
        return this.s.namespace.db;
    }
    /**
     * The name of this collection
     */
    get collectionName() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.s.namespace.collection;
    }
    /**
     * The namespace of this collection, in the format `${this.dbName}.${this.collectionName}`
     */
    get namespace() {
        return this.s.namespace.toString();
    }
    /**
     * The current readConcern of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get readConcern() {
        if (this.s.readConcern == null) {
            return this.s.db.readConcern;
        }
        return this.s.readConcern;
    }
    /**
     * The current readPreference of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get readPreference() {
        if (this.s.readPreference == null) {
            return this.s.db.readPreference;
        }
        return this.s.readPreference;
    }
    get bsonOptions() {
        return this.s.bsonOptions;
    }
    /**
     * The current writeConcern of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get writeConcern() {
        if (this.s.writeConcern == null) {
            return this.s.db.writeConcern;
        }
        return this.s.writeConcern;
    }
    /** The current index hint for the collection */
    get hint() {
        return this.s.collectionHint;
    }
    set hint(v) {
        this.s.collectionHint = (0, utils_1.normalizeHintField)(v);
    }
    insertOne(doc, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        // CSFLE passes in { w: 'majority' } to ensure the lib works in both 3.x and 4.x
        // we support that option style here only
        if (options && Reflect.get(options, 'w')) {
            options.writeConcern = write_concern_1.WriteConcern.fromOptions(Reflect.get(options, 'w'));
        }
        return (0, execute_operation_1.executeOperation)(this, new insert_1.InsertOneOperation(this, doc, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    insertMany(docs, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options ? Object.assign({}, options) : { ordered: true };
        return (0, execute_operation_1.executeOperation)(this, new insert_1.InsertManyOperation(this, docs, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    bulkWrite(operations, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options || { ordered: true };
        if (!Array.isArray(operations)) {
            throw new error_1.MongoInvalidArgumentError('Argument "operations" must be an array of documents');
        }
        return (0, execute_operation_1.executeOperation)(this, new bulk_write_1.BulkWriteOperation(this, operations, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    updateOne(filter, update, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new update_1.UpdateOneOperation(this, filter, update, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    replaceOne(filter, replacement, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new update_1.ReplaceOneOperation(this, filter, replacement, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    updateMany(filter, update, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new update_1.UpdateManyOperation(this, filter, update, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    deleteOne(filter, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new delete_1.DeleteOneOperation(this, filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    deleteMany(filter, options, callback) {
        if (filter == null) {
            filter = {};
            options = {};
            callback = undefined;
        }
        else if (typeof filter === 'function') {
            callback = filter;
            filter = {};
            options = {};
        }
        else if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        return (0, execute_operation_1.executeOperation)(this, new delete_1.DeleteManyOperation(this, filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    rename(newName, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        // Intentionally, we do not inherit options from parent for this operation.
        return (0, execute_operation_1.executeOperation)(this, new rename_1.RenameOperation(this, newName, {
            ...options,
            readPreference: read_preference_1.ReadPreference.PRIMARY
        }), callback);
    }
    drop(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return (0, execute_operation_1.executeOperation)(this, new drop_1.DropCollectionOperation(this.s.db, this.collectionName, options), callback);
    }
    findOne(filter, options, callback) {
        if (callback != null && typeof callback !== 'function') {
            throw new error_1.MongoInvalidArgumentError('Third parameter to `findOne()` must be a callback or undefined');
        }
        if (typeof filter === 'function') {
            callback = filter;
            filter = {};
            options = {};
        }
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        const finalFilter = filter !== null && filter !== void 0 ? filter : {};
        const finalOptions = options !== null && options !== void 0 ? options : {};
        return this.find(finalFilter, finalOptions).limit(-1).batchSize(1).next(callback);
    }
    find(filter, options) {
        if (arguments.length > 2) {
            throw new error_1.MongoInvalidArgumentError('Method "collection.find()" accepts at most two arguments');
        }
        if (typeof options === 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "options" must not be function');
        }
        return new find_cursor_1.FindCursor((0, utils_1.getTopology)(this), this.s.namespace, filter, (0, utils_1.resolveOptions)(this, options));
    }
    options(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new options_operation_1.OptionsOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    isCapped(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new is_capped_1.IsCappedOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    createIndex(indexSpec, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.CreateIndexOperation(this, this.collectionName, indexSpec, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    createIndexes(indexSpecs, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options ? Object.assign({}, options) : {};
        if (typeof options.maxTimeMS !== 'number')
            delete options.maxTimeMS;
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.CreateIndexesOperation(this, this.collectionName, indexSpecs, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    dropIndex(indexName, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = (0, utils_1.resolveOptions)(this, options);
        // Run only against primary
        options.readPreference = read_preference_1.ReadPreference.primary;
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.DropIndexOperation(this, indexName, options), callback);
    }
    dropIndexes(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.DropIndexesOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    /**
     * Get the list of all indexes information for the collection.
     *
     * @param options - Optional settings for the command
     */
    listIndexes(options) {
        return new indexes_1.ListIndexesCursor(this, (0, utils_1.resolveOptions)(this, options));
    }
    indexExists(indexes, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.IndexExistsOperation(this, indexes, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    indexInformation(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.IndexInformationOperation(this.s.db, this.collectionName, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    estimatedDocumentCount(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new estimated_document_count_1.EstimatedDocumentCountOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    countDocuments(filter, options, callback) {
        if (filter == null) {
            (filter = {}), (options = {}), (callback = undefined);
        }
        else if (typeof filter === 'function') {
            (callback = filter), (filter = {}), (options = {});
        }
        else {
            if (arguments.length === 2) {
                if (typeof options === 'function')
                    (callback = options), (options = {});
            }
        }
        filter !== null && filter !== void 0 ? filter : (filter = {});
        return (0, execute_operation_1.executeOperation)(this, new count_documents_1.CountDocumentsOperation(this, filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    // Implementation
    distinct(key, filter, options, callback) {
        if (typeof filter === 'function') {
            (callback = filter), (filter = {}), (options = {});
        }
        else {
            if (arguments.length === 3 && typeof options === 'function') {
                (callback = options), (options = {});
            }
        }
        filter !== null && filter !== void 0 ? filter : (filter = {});
        return (0, execute_operation_1.executeOperation)(this, new distinct_1.DistinctOperation(this, key, filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    indexes(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new indexes_1.IndexesOperation(this, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    stats(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return (0, execute_operation_1.executeOperation)(this, new stats_1.CollStatsOperation(this, options), callback);
    }
    findOneAndDelete(filter, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new find_and_modify_1.FindOneAndDeleteOperation(this, filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    findOneAndReplace(filter, replacement, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new find_and_modify_1.FindOneAndReplaceOperation(this, filter, replacement, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    findOneAndUpdate(filter, update, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        return (0, execute_operation_1.executeOperation)(this, new find_and_modify_1.FindOneAndUpdateOperation(this, filter, update, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    /**
     * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
     *
     * @param pipeline - An array of aggregation pipelines to execute
     * @param options - Optional settings for the command
     */
    aggregate(pipeline = [], options) {
        if (arguments.length > 2) {
            throw new error_1.MongoInvalidArgumentError('Method "collection.aggregate()" accepts at most two arguments');
        }
        if (!Array.isArray(pipeline)) {
            throw new error_1.MongoInvalidArgumentError('Argument "pipeline" must be an array of aggregation stages');
        }
        if (typeof options === 'function') {
            throw new error_1.MongoInvalidArgumentError('Argument "options" must not be function');
        }
        return new aggregation_cursor_1.AggregationCursor((0, utils_1.getTopology)(this), this.s.namespace, pipeline, (0, utils_1.resolveOptions)(this, options));
    }
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
     *
     * @since 3.0.0
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
    mapReduce(map, reduce, options, callback) {
        (0, utils_1.emitWarningOnce)('collection.mapReduce is deprecated. Use the aggregation pipeline instead. Visit https://docs.mongodb.com/manual/reference/map-reduce-to-aggregation-pipeline for more information on how to translate map-reduce operations to the aggregation pipeline.');
        if ('function' === typeof options)
            (callback = options), (options = {});
        // Out must always be defined (make sure we don't break weirdly on pre 1.8+ servers)
        // TODO NODE-3339: Figure out if this is still necessary given we no longer officially support pre-1.8
        if ((options === null || options === void 0 ? void 0 : options.out) == null) {
            throw new error_1.MongoInvalidArgumentError('Option "out" must be defined, see mongodb docs for possible values');
        }
        if ('function' === typeof map) {
            map = map.toString();
        }
        if ('function' === typeof reduce) {
            reduce = reduce.toString();
        }
        if ('function' === typeof options.finalize) {
            options.finalize = options.finalize.toString();
        }
        return (0, execute_operation_1.executeOperation)(this, new map_reduce_1.MapReduceOperation(this, map, reduce, (0, utils_1.resolveOptions)(this, options)), callback);
    }
    /** Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order. */
    initializeUnorderedBulkOp(options) {
        return new unordered_1.UnorderedBulkOperation(this, (0, utils_1.resolveOptions)(this, options));
    }
    /** Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types. */
    initializeOrderedBulkOp(options) {
        return new ordered_1.OrderedBulkOperation(this, (0, utils_1.resolveOptions)(this, options));
    }
    /** Get the db scoped logger */
    getLogger() {
        return this.s.db.s.logger;
    }
    get logger() {
        return this.s.db.s.logger;
    }
    /**
     * Inserts a single document or a an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
     * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
     * can be overridden by setting the **forceServerObjectId** flag.
     *
     * @deprecated Use insertOne, insertMany or bulkWrite instead.
     * @param docs - The documents to insert
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    insert(docs, options, callback) {
        (0, utils_1.emitWarningOnce)('collection.insert is deprecated. Use insertOne, insertMany or bulkWrite instead.');
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options || { ordered: false };
        docs = !Array.isArray(docs) ? [docs] : docs;
        if (options.keepGoing === true) {
            options.ordered = false;
        }
        return this.insertMany(docs, options, callback);
    }
    /**
     * Updates documents.
     *
     * @deprecated use updateOne, updateMany or bulkWrite
     * @param selector - The selector for the update operation.
     * @param update - The update operations to be applied to the documents
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    update(selector, update, options, callback) {
        (0, utils_1.emitWarningOnce)('collection.update is deprecated. Use updateOne, updateMany, or bulkWrite instead.');
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.updateMany(selector, update, options, callback);
    }
    /**
     * Remove documents.
     *
     * @deprecated use deleteOne, deleteMany or bulkWrite
     * @param selector - The selector for the update operation.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    remove(selector, options, callback) {
        (0, utils_1.emitWarningOnce)('collection.remove is deprecated. Use deleteOne, deleteMany, or bulkWrite instead.');
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.deleteMany(selector, options, callback);
    }
    count(filter, options, callback) {
        if (typeof filter === 'function') {
            (callback = filter), (filter = {}), (options = {});
        }
        else {
            if (typeof options === 'function')
                (callback = options), (options = {});
        }
        filter !== null && filter !== void 0 ? filter : (filter = {});
        return (0, execute_operation_1.executeOperation)(this, new count_1.CountOperation(utils_1.MongoDBNamespace.fromString(this.namespace), filter, (0, utils_1.resolveOptions)(this, options)), callback);
    }
}
exports.Collection = Collection;
//# sourceMappingURL=collection.js.map