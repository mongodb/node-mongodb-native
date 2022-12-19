"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsertManyOperation = exports.InsertOneOperation = exports.InsertOperation = void 0;
const error_1 = require("../error");
const write_concern_1 = require("../write_concern");
const bulk_write_1 = require("./bulk_write");
const command_1 = require("./command");
const common_functions_1 = require("./common_functions");
const operation_1 = require("./operation");
/** @internal */
class InsertOperation extends command_1.CommandOperation {
    constructor(ns, documents, options) {
        var _a;
        super(undefined, options);
        this.options = { ...options, checkKeys: (_a = options.checkKeys) !== null && _a !== void 0 ? _a : false };
        this.ns = ns;
        this.documents = documents;
    }
    execute(server, session, callback) {
        var _a;
        const options = (_a = this.options) !== null && _a !== void 0 ? _a : {};
        const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
        const command = {
            insert: this.ns.collection,
            documents: this.documents,
            ordered
        };
        if (typeof options.bypassDocumentValidation === 'boolean') {
            command.bypassDocumentValidation = options.bypassDocumentValidation;
        }
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if (options.comment !== undefined) {
            command.comment = options.comment;
        }
        super.executeCommand(server, session, command, callback);
    }
}
exports.InsertOperation = InsertOperation;
class InsertOneOperation extends InsertOperation {
    constructor(collection, doc, options) {
        super(collection.s.namespace, (0, common_functions_1.prepareDocs)(collection, [doc], options), options);
    }
    execute(server, session, callback) {
        super.execute(server, session, (err, res) => {
            var _a, _b;
            if (err || res == null)
                return callback(err);
            if (res.code)
                return callback(new error_1.MongoServerError(res));
            if (res.writeErrors) {
                // This should be a WriteError but we can't change it now because of error hierarchy
                return callback(new error_1.MongoServerError(res.writeErrors[0]));
            }
            callback(undefined, {
                acknowledged: (_b = ((_a = this.writeConcern) === null || _a === void 0 ? void 0 : _a.w) !== 0) !== null && _b !== void 0 ? _b : true,
                insertedId: this.documents[0]._id
            });
        });
    }
}
exports.InsertOneOperation = InsertOneOperation;
/** @internal */
class InsertManyOperation extends operation_1.AbstractOperation {
    constructor(collection, docs, options) {
        super(options);
        if (!Array.isArray(docs)) {
            throw new error_1.MongoInvalidArgumentError('Argument "docs" must be an array of documents');
        }
        this.options = options;
        this.collection = collection;
        this.docs = docs;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        const options = { ...this.options, ...this.bsonOptions, readPreference: this.readPreference };
        const writeConcern = write_concern_1.WriteConcern.fromOptions(options);
        const bulkWriteOperation = new bulk_write_1.BulkWriteOperation(coll, (0, common_functions_1.prepareDocs)(coll, this.docs, options).map(document => ({ insertOne: { document } })), options);
        bulkWriteOperation.execute(server, session, (err, res) => {
            var _a;
            if (err || res == null) {
                if (err && err.message === 'Operation must be an object with an operation key') {
                    err = new error_1.MongoInvalidArgumentError('Collection.insertMany() cannot be called with an array that has null/undefined values');
                }
                return callback(err);
            }
            callback(undefined, {
                acknowledged: (_a = (writeConcern === null || writeConcern === void 0 ? void 0 : writeConcern.w) !== 0) !== null && _a !== void 0 ? _a : true,
                insertedCount: res.insertedCount,
                insertedIds: res.insertedIds
            });
        });
    }
}
exports.InsertManyOperation = InsertManyOperation;
(0, operation_1.defineAspects)(InsertOperation, [operation_1.Aspect.RETRYABLE, operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(InsertOneOperation, [operation_1.Aspect.RETRYABLE, operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(InsertManyOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=insert.js.map