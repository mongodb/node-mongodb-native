"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeUpdateStatement = exports.ReplaceOneOperation = exports.UpdateManyOperation = exports.UpdateOneOperation = exports.UpdateOperation = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class UpdateOperation extends command_1.CommandOperation {
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
        return this.statements.every(op => op.multi == null || op.multi === false);
    }
    execute(server, session, callback) {
        var _a;
        const options = (_a = this.options) !== null && _a !== void 0 ? _a : {};
        const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
        const command = {
            update: this.ns.collection,
            updates: this.statements,
            ordered
        };
        if (typeof options.bypassDocumentValidation === 'boolean') {
            command.bypassDocumentValidation = options.bypassDocumentValidation;
        }
        if (options.let) {
            command.let = options.let;
        }
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if (options.comment !== undefined) {
            command.comment = options.comment;
        }
        const unacknowledgedWrite = this.writeConcern && this.writeConcern.w === 0;
        if (unacknowledgedWrite) {
            if (this.statements.find((o) => o.hint)) {
                // TODO(NODE-3541): fix error for hint with unacknowledged writes
                callback(new error_1.MongoCompatibilityError(`hint is not supported with unacknowledged writes`));
                return;
            }
        }
        super.executeCommand(server, session, command, callback);
    }
}
exports.UpdateOperation = UpdateOperation;
/** @internal */
class UpdateOneOperation extends UpdateOperation {
    constructor(collection, filter, update, options) {
        super(collection.s.namespace, [makeUpdateStatement(filter, update, { ...options, multi: false })], options);
        if (!(0, utils_1.hasAtomicOperators)(update)) {
            throw new error_1.MongoInvalidArgumentError('Update document requires atomic operators');
        }
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || !res)
                return callback(err);
            if (this.explain != null)
                return callback(undefined, res);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors)
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                modifiedCount: res.nModified != null ? res.nModified : res.n,
                upsertedId: Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
                upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
                matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
            });
        });
    }
}
exports.UpdateOneOperation = UpdateOneOperation;
/** @internal */
class UpdateManyOperation extends UpdateOperation {
    constructor(collection, filter, update, options) {
        super(collection.s.namespace, [makeUpdateStatement(filter, update, { ...options, multi: true })], options);
        if (!(0, utils_1.hasAtomicOperators)(update)) {
            throw new error_1.MongoInvalidArgumentError('Update document requires atomic operators');
        }
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || !res)
                return callback(err);
            if (this.explain != null)
                return callback(undefined, res);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors)
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                modifiedCount: res.nModified != null ? res.nModified : res.n,
                upsertedId: Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
                upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
                matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
            });
        });
    }
}
exports.UpdateManyOperation = UpdateManyOperation;
/** @internal */
class ReplaceOneOperation extends UpdateOperation {
    constructor(collection, filter, replacement, options) {
        super(collection.s.namespace, [makeUpdateStatement(filter, replacement, { ...options, multi: false })], options);
        if ((0, utils_1.hasAtomicOperators)(replacement)) {
            throw new error_1.MongoInvalidArgumentError('Replacement document must not contain atomic operators');
        }
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || !res)
                return callback(err);
            if (this.explain != null)
                return callback(undefined, res);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors)
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                modifiedCount: res.nModified != null ? res.nModified : res.n,
                upsertedId: Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
                upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
                matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
            });
        });
    }
}
exports.ReplaceOneOperation = ReplaceOneOperation;
function makeUpdateStatement(filter, update, options) {
    if (filter == null || typeof filter !== 'object') {
        throw new error_1.MongoInvalidArgumentError('Selector must be a valid JavaScript object');
    }
    if (update == null || typeof update !== 'object') {
        throw new error_1.MongoInvalidArgumentError('Document must be a valid JavaScript object');
    }
    const op = { q: filter, u: update };
    if (typeof options.upsert === 'boolean') {
        op.upsert = options.upsert;
    }
    if (options.multi) {
        op.multi = options.multi;
    }
    if (options.hint) {
        op.hint = options.hint;
    }
    if (options.arrayFilters) {
        op.arrayFilters = options.arrayFilters;
    }
    if (options.collation) {
        op.collation = options.collation;
    }
    return op;
}
exports.makeUpdateStatement = makeUpdateStatement;
(0, operation_1.defineAspects)(UpdateOperation, [operation_1.Aspect.RETRYABLE, operation_1.Aspect.WRITE_OPERATION, operation_1.Aspect.SKIP_COLLATION]);
(0, operation_1.defineAspects)(UpdateOneOperation, [
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.WRITE_OPERATION,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.SKIP_COLLATION
]);
(0, operation_1.defineAspects)(UpdateManyOperation, [
    operation_1.Aspect.WRITE_OPERATION,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.SKIP_COLLATION
]);
(0, operation_1.defineAspects)(ReplaceOneOperation, [
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.WRITE_OPERATION,
    operation_1.Aspect.SKIP_COLLATION
]);
//# sourceMappingURL=update.js.map