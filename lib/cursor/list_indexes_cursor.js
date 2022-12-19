"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListIndexesCursor = void 0;
const execute_operation_1 = require("../operations/execute_operation");
const indexes_1 = require("../operations/indexes");
const abstract_cursor_1 = require("./abstract_cursor");
/** @public */
class ListIndexesCursor extends abstract_cursor_1.AbstractCursor {
    constructor(collection, options) {
        super(collection.s.db.s.client, collection.s.namespace, options);
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
        const operation = new indexes_1.ListIndexesOperation(this.parent, {
            ...this.cursorOptions,
            ...this.options,
            session
        });
        (0, execute_operation_1.executeOperation)(this.parent.s.db.s.client, operation, (err, response) => {
            if (err || response == null)
                return callback(err);
            // TODO: NODE-2882
            callback(undefined, { server: operation.server, session, response });
        });
    }
}
exports.ListIndexesCursor = ListIndexesCursor;
//# sourceMappingURL=list_indexes_cursor.js.map