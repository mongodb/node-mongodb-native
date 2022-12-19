"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapReduceOperation = void 0;
const bson_1 = require("../bson");
const error_1 = require("../error");
const read_preference_1 = require("../read_preference");
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
const exclusionList = [
    'explain',
    'readPreference',
    'readConcern',
    'session',
    'bypassDocumentValidation',
    'writeConcern',
    'raw',
    'fieldsAsRaw',
    'promoteLongs',
    'promoteValues',
    'promoteBuffers',
    'bsonRegExp',
    'serializeFunctions',
    'ignoreUndefined',
    'enableUtf8Validation',
    'scope' // this option is reformatted thus exclude the original
];
/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 * @internal
 */
class MapReduceOperation extends command_1.CommandOperation {
    /**
     * Constructs a MapReduce operation.
     *
     * @param collection - Collection instance.
     * @param map - The mapping function.
     * @param reduce - The reduce function.
     * @param options - Optional settings. See Collection.prototype.mapReduce for a list of options.
     */
    constructor(collection, map, reduce, options) {
        super(collection, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.collection = collection;
        this.map = map;
        this.reduce = reduce;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        const map = this.map;
        const reduce = this.reduce;
        let options = this.options;
        const mapCommandHash = {
            mapReduce: coll.collectionName,
            map: map,
            reduce: reduce
        };
        if (options.scope) {
            mapCommandHash.scope = processScope(options.scope);
        }
        // Add any other options passed in
        for (const n in options) {
            // Only include if not in exclusion list
            if (exclusionList.indexOf(n) === -1) {
                mapCommandHash[n] = options[n];
            }
        }
        options = Object.assign({}, options);
        // If we have a read preference and inline is not set as output fail hard
        if (this.readPreference.mode === read_preference_1.ReadPreferenceMode.primary &&
            options.out &&
            options.out.inline !== 1 &&
            options.out !== 'inline') {
            // Force readPreference to primary
            options.readPreference = read_preference_1.ReadPreference.primary;
            // Decorate command with writeConcern if supported
            (0, utils_1.applyWriteConcern)(mapCommandHash, { db: coll.s.db, collection: coll }, options);
        }
        else {
            (0, utils_1.decorateWithReadConcern)(mapCommandHash, coll, options);
        }
        // Is bypassDocumentValidation specified
        if (options.bypassDocumentValidation === true) {
            mapCommandHash.bypassDocumentValidation = options.bypassDocumentValidation;
        }
        // Have we specified collation
        try {
            (0, utils_1.decorateWithCollation)(mapCommandHash, coll, options);
        }
        catch (err) {
            return callback(err);
        }
        if (this.explain && (0, utils_1.maxWireVersion)(server) < 9) {
            callback(new error_1.MongoCompatibilityError(`Server ${server.name} does not support explain on mapReduce`));
            return;
        }
        // Execute command
        super.executeCommand(server, session, mapCommandHash, (err, result) => {
            if (err)
                return callback(err);
            // Check if we have an error
            if (1 !== result.ok || result.err || result.errmsg) {
                return callback(new error_1.MongoServerError(result));
            }
            // If an explain option was executed, don't process the server results
            if (this.explain)
                return callback(undefined, result);
            // Create statistics value
            const stats = {};
            if (result.timeMillis)
                stats['processtime'] = result.timeMillis;
            if (result.counts)
                stats['counts'] = result.counts;
            if (result.timing)
                stats['timing'] = result.timing;
            // invoked with inline?
            if (result.results) {
                // If we wish for no verbosity
                if (options['verbose'] == null || !options['verbose']) {
                    return callback(undefined, result.results);
                }
                return callback(undefined, { results: result.results, stats: stats });
            }
            // The returned collection
            let collection = null;
            // If we have an object it's a different db
            if (result.result != null && typeof result.result === 'object') {
                const doc = result.result;
                // Return a collection from another db
                collection = coll.s.db.s.client.db(doc.db, coll.s.db.s.options).collection(doc.collection);
            }
            else {
                // Create a collection object that wraps the result collection
                collection = coll.s.db.collection(result.result);
            }
            // If we wish for no verbosity
            if (options['verbose'] == null || !options['verbose']) {
                return callback(err, collection);
            }
            // Return stats as third set of values
            callback(err, { collection, stats });
        });
    }
}
exports.MapReduceOperation = MapReduceOperation;
/** Functions that are passed as scope args must be converted to Code instances. */
function processScope(scope) {
    if (!(0, utils_1.isObject)(scope) || scope._bsontype === 'ObjectID') {
        return scope;
    }
    const newScope = {};
    for (const key of Object.keys(scope)) {
        if ('function' === typeof scope[key]) {
            newScope[key] = new bson_1.Code(String(scope[key]));
        }
        else if (scope[key]._bsontype === 'Code') {
            newScope[key] = scope[key];
        }
        else {
            newScope[key] = processScope(scope[key]);
        }
    }
    return newScope;
}
(0, operation_1.defineAspects)(MapReduceOperation, [operation_1.Aspect.EXPLAINABLE]);
//# sourceMappingURL=map_reduce.js.map