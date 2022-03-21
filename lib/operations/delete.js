"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDeleteStatement = exports.DeleteManyOperation = exports.DeleteOneOperation = exports.DeleteOperation = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class DeleteOperation extends command_1.CommandOperation {
    constructor(ns, statements, options) {
        super(undefined, options);
        this.options = options;
        this.ns = ns;
        this.statements = statements;
    }
    get canRetryWrite() {
        if (super.canRetryWrite === false) {
            return false;
        }
        return this.statements.every(op => (op.limit != null ? op.limit > 0 : true));
    }
    execute(server, session, callback) {
        var _a;
        const options = (_a = this.options) !== null && _a !== void 0 ? _a : {};
        const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
        const command = {
            delete: this.ns.collection,
            deletes: this.statements,
            ordered
        };
        if (options.let) {
            command.let = options.let;
        }
        if (options.explain != null && (0, utils_1.maxWireVersion)(server) < 3) {
            return callback
                ? callback(new error_1.MongoCompatibilityError(`Server ${server.name} does not support explain on delete`))
                : undefined;
        }
        const unacknowledgedWrite = this.writeConcern && this.writeConcern.w === 0;
        if (unacknowledgedWrite || (0, utils_1.maxWireVersion)(server) < 5) {
            if (this.statements.find((o) => o.hint)) {
                callback(new error_1.MongoCompatibilityError(`Servers < 3.4 do not support hint on delete`));
                return;
            }
        }
        const statementWithCollation = this.statements.find(statement => !!statement.collation);
        if (statementWithCollation && (0, utils_1.collationNotSupported)(server, statementWithCollation)) {
            callback(new error_1.MongoCompatibilityError(`Server ${server.name} does not support collation`));
            return;
        }
        super.executeCommand(server, session, command, callback);
    }
}
exports.DeleteOperation = DeleteOperation;
class DeleteOneOperation extends DeleteOperation {
    constructor(collection, filter, options) {
        super(collection.s.namespace, [makeDeleteStatement(filter, { ...options, limit: 1 })], options);
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || res == null)
                return callback(err);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors)
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            if (this.explain)
                return callback(undefined, res);
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                deletedCount: res.n
            });
        });
    }
}
exports.DeleteOneOperation = DeleteOneOperation;
class DeleteManyOperation extends DeleteOperation {
    constructor(collection, filter, options) {
        super(collection.s.namespace, [makeDeleteStatement(filter, options)], options);
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || res == null)
                return callback(err);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors)
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            if (this.explain)
                return callback(undefined, res);
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                deletedCount: res.n
            });
        });
    }
}
exports.DeleteManyOperation = DeleteManyOperation;
function makeDeleteStatement(filter, options) {
    const op = {
        q: filter,
        limit: typeof options.limit === 'number' ? options.limit : 0
    };
    if (options.single === true) {
        op.limit = 1;
    }
    if (options.collation) {
        op.collation = options.collation;
    }
    if (options.hint) {
        op.hint = options.hint;
    }
    if (options.comment) {
        op.comment = options.comment;
    }
    return op;
}
exports.makeDeleteStatement = makeDeleteStatement;
(0, operation_1.defineAspects)(DeleteOperation, [operation_1.Aspect.RETRYABLE, operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(DeleteOneOperation, [
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.WRITE_OPERATION,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.SKIP_COLLATION
]);
(0, operation_1.defineAspects)(DeleteManyOperation, [
    operation_1.Aspect.WRITE_OPERATION,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.SKIP_COLLATION
]);
//# sourceMappingURL=delete.js.map