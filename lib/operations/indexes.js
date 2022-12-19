"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexInformationOperation = exports.IndexExistsOperation = exports.ListIndexesOperation = exports.DropIndexesOperation = exports.DropIndexOperation = exports.EnsureIndexOperation = exports.CreateIndexOperation = exports.CreateIndexesOperation = exports.IndexesOperation = void 0;
const error_1 = require("../error");
const read_preference_1 = require("../read_preference");
const utils_1 = require("../utils");
const command_1 = require("./command");
const common_functions_1 = require("./common_functions");
const operation_1 = require("./operation");
const VALID_INDEX_OPTIONS = new Set([
    'background',
    'unique',
    'name',
    'partialFilterExpression',
    'sparse',
    'hidden',
    'expireAfterSeconds',
    'storageEngine',
    'collation',
    'version',
    // text indexes
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    // 2d-sphere indexes
    '2dsphereIndexVersion',
    // 2d indexes
    'bits',
    'min',
    'max',
    // geoHaystack Indexes
    'bucketSize',
    // wildcard indexes
    'wildcardProjection'
]);
function isIndexDirection(x) {
    return (typeof x === 'number' || x === '2d' || x === '2dsphere' || x === 'text' || x === 'geoHaystack');
}
function isSingleIndexTuple(t) {
    return Array.isArray(t) && t.length === 2 && isIndexDirection(t[1]);
}
function makeIndexSpec(indexSpec, options) {
    var _a;
    const key = new Map();
    const indexSpecs = !Array.isArray(indexSpec) || isSingleIndexTuple(indexSpec) ? [indexSpec] : indexSpec;
    // Iterate through array and handle different types
    for (const spec of indexSpecs) {
        if (typeof spec === 'string') {
            key.set(spec, 1);
        }
        else if (Array.isArray(spec)) {
            key.set(spec[0], (_a = spec[1]) !== null && _a !== void 0 ? _a : 1);
        }
        else if (spec instanceof Map) {
            for (const [property, value] of spec) {
                key.set(property, value);
            }
        }
        else if ((0, utils_1.isObject)(spec)) {
            for (const [property, value] of Object.entries(spec)) {
                key.set(property, value);
            }
        }
    }
    return { ...options, key };
}
/** @internal */
class IndexesOperation extends operation_1.AbstractOperation {
    constructor(collection, options) {
        super(options);
        this.options = options;
        this.collection = collection;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        const options = this.options;
        (0, common_functions_1.indexInformation)(coll.s.db, coll.collectionName, { full: true, ...options, readPreference: this.readPreference, session }, callback);
    }
}
exports.IndexesOperation = IndexesOperation;
/** @internal */
class CreateIndexesOperation extends command_1.CommandOperation {
    constructor(parent, collectionName, indexes, options) {
        super(parent, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.collectionName = collectionName;
        this.indexes = indexes.map(userIndex => {
            // Ensure the key is a Map to preserve index key ordering
            const key = userIndex.key instanceof Map ? userIndex.key : new Map(Object.entries(userIndex.key));
            const name = userIndex.name != null ? userIndex.name : Array.from(key).flat().join('_');
            const validIndexOptions = Object.fromEntries(Object.entries({ ...userIndex }).filter(([optionName]) => VALID_INDEX_OPTIONS.has(optionName)));
            return {
                ...validIndexOptions,
                name,
                key
            };
        });
    }
    execute(server, session, callback) {
        const options = this.options;
        const indexes = this.indexes;
        const serverWireVersion = (0, utils_1.maxWireVersion)(server);
        const cmd = { createIndexes: this.collectionName, indexes };
        if (options.commitQuorum != null) {
            if (serverWireVersion < 9) {
                callback(new error_1.MongoCompatibilityError('Option `commitQuorum` for `createIndexes` not supported on servers < 4.4'));
                return;
            }
            cmd.commitQuorum = options.commitQuorum;
        }
        // collation is set on each index, it should not be defined at the root
        this.options.collation = undefined;
        super.executeCommand(server, session, cmd, err => {
            if (err) {
                callback(err);
                return;
            }
            const indexNames = indexes.map(index => index.name || '');
            callback(undefined, indexNames);
        });
    }
}
exports.CreateIndexesOperation = CreateIndexesOperation;
/** @internal */
class CreateIndexOperation extends CreateIndexesOperation {
    constructor(parent, collectionName, indexSpec, options) {
        super(parent, collectionName, [makeIndexSpec(indexSpec, options)], options);
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, indexNames) => {
            if (err || !indexNames)
                return callback(err);
            return callback(undefined, indexNames[0]);
        });
    }
}
exports.CreateIndexOperation = CreateIndexOperation;
/** @internal */
class EnsureIndexOperation extends CreateIndexOperation {
    constructor(db, collectionName, indexSpec, options) {
        super(db, collectionName, indexSpec, options);
        this.readPreference = read_preference_1.ReadPreference.primary;
        this.db = db;
        this.collectionName = collectionName;
    }
    execute(server, session, callback) {
        const indexName = this.indexes[0].name;
        const cursor = this.db.collection(this.collectionName).listIndexes({ session });
        cursor.toArray((err, indexes) => {
            /// ignore "NamespaceNotFound" errors
            if (err && err.code !== error_1.MONGODB_ERROR_CODES.NamespaceNotFound) {
                return callback(err);
            }
            if (indexes) {
                indexes = Array.isArray(indexes) ? indexes : [indexes];
                if (indexes.some(index => index.name === indexName)) {
                    callback(undefined, indexName);
                    return;
                }
            }
            super.execute(server, session, callback);
        });
    }
}
exports.EnsureIndexOperation = EnsureIndexOperation;
/** @internal */
class DropIndexOperation extends command_1.CommandOperation {
    constructor(collection, indexName, options) {
        super(collection, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.collection = collection;
        this.indexName = indexName;
    }
    execute(server, session, callback) {
        const cmd = { dropIndexes: this.collection.collectionName, index: this.indexName };
        super.executeCommand(server, session, cmd, callback);
    }
}
exports.DropIndexOperation = DropIndexOperation;
/** @internal */
class DropIndexesOperation extends DropIndexOperation {
    constructor(collection, options) {
        super(collection, '*', options);
    }
    execute(server, session, callback) {
        super.execute(server, session, err => {
            if (err)
                return callback(err, false);
            callback(undefined, true);
        });
    }
}
exports.DropIndexesOperation = DropIndexesOperation;
/** @internal */
class ListIndexesOperation extends command_1.CommandOperation {
    constructor(collection, options) {
        super(collection, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.collectionNamespace = collection.s.namespace;
    }
    execute(server, session, callback) {
        const serverWireVersion = (0, utils_1.maxWireVersion)(server);
        const cursor = this.options.batchSize ? { batchSize: this.options.batchSize } : {};
        const command = { listIndexes: this.collectionNamespace.collection, cursor };
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if (serverWireVersion >= 9 && this.options.comment !== undefined) {
            command.comment = this.options.comment;
        }
        super.executeCommand(server, session, command, callback);
    }
}
exports.ListIndexesOperation = ListIndexesOperation;
/** @internal */
class IndexExistsOperation extends operation_1.AbstractOperation {
    constructor(collection, indexes, options) {
        super(options);
        this.options = options;
        this.collection = collection;
        this.indexes = indexes;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        const indexes = this.indexes;
        (0, common_functions_1.indexInformation)(coll.s.db, coll.collectionName, { ...this.options, readPreference: this.readPreference, session }, (err, indexInformation) => {
            // If we have an error return
            if (err != null)
                return callback(err);
            // Let's check for the index names
            if (!Array.isArray(indexes))
                return callback(undefined, indexInformation[indexes] != null);
            // Check in list of indexes
            for (let i = 0; i < indexes.length; i++) {
                if (indexInformation[indexes[i]] == null) {
                    return callback(undefined, false);
                }
            }
            // All keys found return true
            return callback(undefined, true);
        });
    }
}
exports.IndexExistsOperation = IndexExistsOperation;
/** @internal */
class IndexInformationOperation extends operation_1.AbstractOperation {
    constructor(db, name, options) {
        super(options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.db = db;
        this.name = name;
    }
    execute(server, session, callback) {
        const db = this.db;
        const name = this.name;
        (0, common_functions_1.indexInformation)(db, name, { ...this.options, readPreference: this.readPreference, session }, callback);
    }
}
exports.IndexInformationOperation = IndexInformationOperation;
(0, operation_1.defineAspects)(ListIndexesOperation, [
    operation_1.Aspect.READ_OPERATION,
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.CURSOR_CREATING
]);
(0, operation_1.defineAspects)(CreateIndexesOperation, [operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(CreateIndexOperation, [operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(EnsureIndexOperation, [operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(DropIndexOperation, [operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(DropIndexesOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=indexes.js.map