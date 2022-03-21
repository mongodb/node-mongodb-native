"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexInformationOperation = exports.IndexExistsOperation = exports.ListIndexesCursor = exports.ListIndexesOperation = exports.DropIndexesOperation = exports.DropIndexOperation = exports.EnsureIndexOperation = exports.CreateIndexOperation = exports.CreateIndexesOperation = exports.IndexesOperation = void 0;
const abstract_cursor_1 = require("../cursor/abstract_cursor");
const error_1 = require("../error");
const read_preference_1 = require("../read_preference");
const utils_1 = require("../utils");
const command_1 = require("./command");
const common_functions_1 = require("./common_functions");
const execute_operation_1 = require("./execute_operation");
const operation_1 = require("./operation");
const LIST_INDEXES_WIRE_VERSION = 3;
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
function makeIndexSpec(indexSpec, options) {
    const indexParameters = (0, utils_1.parseIndexOptions)(indexSpec);
    // Generate the index name
    const name = typeof options.name === 'string' ? options.name : indexParameters.name;
    // Set up the index
    const finalIndexSpec = { name, key: indexParameters.fieldHash };
    // merge valid index options into the index spec
    for (const optionName in options) {
        if (VALID_INDEX_OPTIONS.has(optionName)) {
            finalIndexSpec[optionName] = options[optionName];
        }
    }
    return finalIndexSpec;
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
        this.indexes = indexes;
    }
    execute(server, session, callback) {
        const options = this.options;
        const indexes = this.indexes;
        const serverWireVersion = (0, utils_1.maxWireVersion)(server);
        // Ensure we generate the correct name if the parameter is not set
        for (let i = 0; i < indexes.length; i++) {
            // Did the user pass in a collation, check if our write server supports it
            if (indexes[i].collation && serverWireVersion < 5) {
                callback(new error_1.MongoCompatibilityError(`Server ${server.name}, which reports wire version ${serverWireVersion}, ` +
                    'does not support collation'));
                return;
            }
            if (indexes[i].name == null) {
                const keys = [];
                for (const name in indexes[i].key) {
                    keys.push(`${name}_${indexes[i].key[name]}`);
                }
                // Set the name
                indexes[i].name = keys.join('_');
            }
        }
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
        // createIndex can be called with a variety of styles:
        //   coll.createIndex('a');
        //   coll.createIndex({ a: 1 });
        //   coll.createIndex([['a', 1]]);
        // createIndexes is always called with an array of index spec objects
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
        if (serverWireVersion < LIST_INDEXES_WIRE_VERSION) {
            const systemIndexesNS = this.collectionNamespace.withCollection('system.indexes');
            const collectionNS = this.collectionNamespace.toString();
            server.query(systemIndexesNS, { query: { ns: collectionNS } }, { ...this.options, readPreference: this.readPreference }, callback);
            return;
        }
        const cursor = this.options.batchSize ? { batchSize: this.options.batchSize } : {};
        super.executeCommand(server, session, { listIndexes: this.collectionNamespace.collection, cursor }, callback);
    }
}
exports.ListIndexesOperation = ListIndexesOperation;
/** @public */
class ListIndexesCursor extends abstract_cursor_1.AbstractCursor {
    constructor(collection, options) {
        super((0, utils_1.getTopology)(collection), collection.s.namespace, options);
        this.parent = collection;
        this.options = options;
    }
    clone() {
        return new ListIndexesCursor(this.parent, {
            ...this.options,
            ...this.cursorOptions
        });
    }
    /** @internal */
    _initialize(session, callback) {
        const operation = new ListIndexesOperation(this.parent, {
            ...this.cursorOptions,
            ...this.options,
            session
        });
        (0, execute_operation_1.executeOperation)((0, utils_1.getTopology)(this.parent), operation, (err, response) => {
            if (err || response == null)
                return callback(err);
            // TODO: NODE-2882
            callback(undefined, { server: operation.server, session, response });
        });
    }
}
exports.ListIndexesCursor = ListIndexesCursor;
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