"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListDatabasesOperation = void 0;
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class ListDatabasesOperation extends command_1.CommandOperation {
    constructor(db, options) {
        super(db, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.ns = new utils_1.MongoDBNamespace('admin', '$cmd');
    }
    execute(server, session, callback) {
        const cmd = { listDatabases: 1 };
        if (this.options.nameOnly) {
            cmd.nameOnly = Number(cmd.nameOnly);
        }
        if (this.options.filter) {
            cmd.filter = this.options.filter;
        }
        if (typeof this.options.authorizedDatabases === 'boolean') {
            cmd.authorizedDatabases = this.options.authorizedDatabases;
        }
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if ((0, utils_1.maxWireVersion)(server) >= 9 && this.options.comment !== undefined) {
            cmd.comment = this.options.comment;
        }
        super.executeCommand(server, session, cmd, callback);
    }
}
exports.ListDatabasesOperation = ListDatabasesOperation;
(0, operation_1.defineAspects)(ListDatabasesOperation, [operation_1.Aspect.READ_OPERATION, operation_1.Aspect.RETRYABLE]);
//# sourceMappingURL=list_databases.js.map