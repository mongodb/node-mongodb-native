"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateOperation = exports.DB_AGGREGATE_COLLECTION = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
exports.DB_AGGREGATE_COLLECTION = 1;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8;
/** @internal */
class AggregateOperation extends command_1.CommandOperation {
    constructor(ns, pipeline, options) {
        super(undefined, { ...options, dbName: ns.db });
        this.options = options !== null && options !== void 0 ? options : {};
        // Covers when ns.collection is null, undefined or the empty string, use DB_AGGREGATE_COLLECTION
        this.target = ns.collection || exports.DB_AGGREGATE_COLLECTION;
        this.pipeline = pipeline;
        // determine if we have a write stage, override read preference if so
        this.hasWriteStage = false;
        if (typeof (options === null || options === void 0 ? void 0 : options.out) === 'string') {
            this.pipeline = this.pipeline.concat({ $out: options.out });
            this.hasWriteStage = true;
        }
        else if (pipeline.length > 0) {
            const finalStage = pipeline[pipeline.length - 1];
            if (finalStage.$out || finalStage.$merge) {
                this.hasWriteStage = true;
            }
        }
        if (this.hasWriteStage) {
            this.trySecondaryWrite = true;
        }
        if (this.explain && this.writeConcern) {
            throw new error_1.MongoInvalidArgumentError('Option "explain" cannot be used on an aggregate call with writeConcern');
        }
        if ((options === null || options === void 0 ? void 0 : options.cursor) != null && typeof options.cursor !== 'object') {
            throw new error_1.MongoInvalidArgumentError('Cursor options must be an object');
        }
    }
    get canRetryRead() {
        return !this.hasWriteStage;
    }
    addToPipeline(stage) {
        this.pipeline.push(stage);
    }
    execute(server, session, callback) {
        const options = this.options;
        const serverWireVersion = (0, utils_1.maxWireVersion)(server);
        const command = { aggregate: this.target, pipeline: this.pipeline };
        if (this.hasWriteStage && serverWireVersion < MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
            this.readConcern = undefined;
        }
        if (this.hasWriteStage && this.writeConcern) {
            Object.assign(command, { writeConcern: this.writeConcern });
        }
        if (options.bypassDocumentValidation === true) {
            command.bypassDocumentValidation = options.bypassDocumentValidation;
        }
        if (typeof options.allowDiskUse === 'boolean') {
            command.allowDiskUse = options.allowDiskUse;
        }
        if (options.hint) {
            command.hint = options.hint;
        }
        if (options.let) {
            command.let = options.let;
        }
        // we check for undefined specifically here to allow falsy values
        // eslint-disable-next-line no-restricted-syntax
        if (options.comment !== undefined) {
            command.comment = options.comment;
        }
        command.cursor = options.cursor || {};
        if (options.batchSize && !this.hasWriteStage) {
            command.cursor.batchSize = options.batchSize;
        }
        super.executeCommand(server, session, command, callback);
    }
}
exports.AggregateOperation = AggregateOperation;
(0, operation_1.defineAspects)(AggregateOperation, [
    operation_1.Aspect.READ_OPERATION,
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.CURSOR_CREATING
]);
//# sourceMappingURL=aggregate.js.map