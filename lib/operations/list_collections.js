"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListCollectionsCursor = exports.ListCollectionsOperation = void 0;
const CONSTANTS = require("../constants");
const abstract_cursor_1 = require("../cursor/abstract_cursor");
const utils_1 = require("../utils");
const command_1 = require("./command");
const execute_operation_1 = require("./execute_operation");
const operation_1 = require("./operation");
const LIST_COLLECTIONS_WIRE_VERSION = 3;
/** @internal */
class ListCollectionsOperation extends command_1.CommandOperation {
    constructor(db, filter, options) {
        super(db, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.db = db;
        this.filter = filter;
        this.nameOnly = !!this.options.nameOnly;
        this.authorizedCollections = !!this.options.authorizedCollections;
        if (typeof this.options.batchSize === 'number') {
            this.batchSize = this.options.batchSize;
        }
    }
    execute(server, session, callback) {
        if ((0, utils_1.maxWireVersion)(server) < LIST_COLLECTIONS_WIRE_VERSION) {
            let filter = this.filter;
            const databaseName = this.db.s.namespace.db;
            // If we have legacy mode and have not provided a full db name filter it
            if (typeof filter.name === 'string' && !new RegExp(`^${databaseName}\\.`).test(filter.name)) {
                filter = Object.assign({}, filter);
                filter.name = this.db.s.namespace.withCollection(filter.name).toString();
            }
            // No filter, filter by current database
            if (filter == null) {
                filter = { name: `/${databaseName}/` };
            }
            // Rewrite the filter to use $and to filter out indexes
            if (filter.name) {
                filter = { $and: [{ name: filter.name }, { name: /^((?!\$).)*$/ }] };
            }
            else {
                filter = { name: /^((?!\$).)*$/ };
            }
            const documentTransform = (doc) => {
                const matching = `${databaseName}.`;
                const index = doc.name.indexOf(matching);
                // Remove database name if available
                if (doc.name && index === 0) {
                    doc.name = doc.name.substr(index + matching.length);
                }
                return doc;
            };
            server.query(new utils_1.MongoDBNamespace(databaseName, CONSTANTS.SYSTEM_NAMESPACE_COLLECTION), { query: filter }, { batchSize: this.batchSize || 1000, readPreference: this.readPreference }, (err, result) => {
                if (result && result.documents && Array.isArray(result.documents)) {
                    result.documents = result.documents.map(documentTransform);
                }
                callback(err, result);
            });
            return;
        }
        return super.executeCommand(server, session, this.generateCommand(), callback);
    }
    /* This is here for the purpose of unit testing the final command that gets sent. */
    generateCommand() {
        return {
            listCollections: 1,
            filter: this.filter,
            cursor: this.batchSize ? { batchSize: this.batchSize } : {},
            nameOnly: this.nameOnly,
            authorizedCollections: this.authorizedCollections
        };
    }
}
exports.ListCollectionsOperation = ListCollectionsOperation;
/** @public */
class ListCollectionsCursor extends abstract_cursor_1.AbstractCursor {
    constructor(db, filter, options) {
        super((0, utils_1.getTopology)(db), db.s.namespace, options);
        this.parent = db;
        this.filter = filter;
        this.options = options;
    }
    clone() {
        return new ListCollectionsCursor(this.parent, this.filter, {
            ...this.options,
            ...this.cursorOptions
        });
    }
    /** @internal */
    _initialize(session, callback) {
        const operation = new ListCollectionsOperation(this.parent, this.filter, {
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
exports.ListCollectionsCursor = ListCollectionsCursor;
(0, operation_1.defineAspects)(ListCollectionsOperation, [
    operation_1.Aspect.READ_OPERATION,
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.CURSOR_CREATING
]);
//# sourceMappingURL=list_collections.js.map