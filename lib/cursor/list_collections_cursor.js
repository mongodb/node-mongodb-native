"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListCollectionsCursor = void 0;
const execute_operation_1 = require("../operations/execute_operation");
const list_collections_1 = require("../operations/list_collections");
const abstract_cursor_1 = require("./abstract_cursor");
/** @public */
class ListCollectionsCursor extends abstract_cursor_1.AbstractCursor {
    constructor(db, filter, options) {
        super(db.s.client, db.s.namespace, options);
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
        const operation = new list_collections_1.ListCollectionsOperation(this.parent, this.filter, {
            ...this.cursorOptions,
            ...this.options,
            session
        });
        (0, execute_operation_1.executeOperation)(this.parent.s.client, operation, (err, response) => {
            if (err || response == null)
                return callback(err);
            // TODO: NODE-2882
            callback(undefined, { server: operation.server, session, response });
        });
    }
}
exports.ListCollectionsCursor = ListCollectionsCursor;
//# sourceMappingURL=list_collections_cursor.js.map