"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindOperation = void 0;
const error_1 = require("../error");
const read_concern_1 = require("../read_concern");
const sort_1 = require("../sort");
const utils_1 = require("../utils");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class FindOperation extends command_1.CommandOperation {
    constructor(collection, ns, filter = {}, options = {}) {
        super(collection, options);
        this.options = options;
        this.ns = ns;
        if (typeof filter !== 'object' || Array.isArray(filter)) {
            throw new error_1.MongoInvalidArgumentError('Query filter must be a plain object or ObjectId');
        }
        // If the filter is a buffer, validate that is a valid BSON document
        if (Buffer.isBuffer(filter)) {
            const objectSize = filter[0] | (filter[1] << 8) | (filter[2] << 16) | (filter[3] << 24);
            if (objectSize !== filter.length) {
                throw new error_1.MongoInvalidArgumentError(`Query filter raw message size does not match message header size [${filter.length}] != [${objectSize}]`);
            }
        }
        // special case passing in an ObjectId as a filter
        this.filter = filter != null && filter._bsontype === 'ObjectID' ? { _id: filter } : filter;
    }
    execute(server, session, callback) {
        this.server = server;
        const options = this.options;
        let findCommand = makeFindCommand(this.ns, this.filter, options);
        if (this.explain) {
            findCommand = (0, utils_1.decorateWithExplain)(findCommand, this.explain);
        }
        server.command(this.ns, findCommand, {
            ...this.options,
            ...this.bsonOptions,
            documentsReturnedIn: 'firstBatch',
            session
        }, callback);
    }
}
exports.FindOperation = FindOperation;
function makeFindCommand(ns, filter, options) {
    const findCommand = {
        find: ns.collection,
        filter
    };
    if (options.sort) {
        findCommand.sort = (0, sort_1.formatSort)(options.sort);
    }
    if (options.projection) {
        let projection = options.projection;
        if (projection && Array.isArray(projection)) {
            projection = projection.length
                ? projection.reduce((result, field) => {
                    result[field] = 1;
                    return result;
                }, {})
                : { _id: 1 };
        }
        findCommand.projection = projection;
    }
    if (options.hint) {
        findCommand.hint = (0, utils_1.normalizeHintField)(options.hint);
    }
    if (typeof options.skip === 'number') {
        findCommand.skip = options.skip;
    }
    if (typeof options.limit === 'number') {
        if (options.limit < 0) {
            findCommand.limit = -options.limit;
            findCommand.singleBatch = true;
        }
        else {
            findCommand.limit = options.limit;
        }
    }
    if (typeof options.batchSize === 'number') {
        if (options.batchSize < 0) {
            if (options.limit &&
                options.limit !== 0 &&
                Math.abs(options.batchSize) < Math.abs(options.limit)) {
                findCommand.limit = -options.batchSize;
            }
            findCommand.singleBatch = true;
        }
        else {
            findCommand.batchSize = options.batchSize;
        }
    }
    if (typeof options.singleBatch === 'boolean') {
        findCommand.singleBatch = options.singleBatch;
    }
    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
        findCommand.comment = options.comment;
    }
    if (typeof options.maxTimeMS === 'number') {
        findCommand.maxTimeMS = options.maxTimeMS;
    }
    const readConcern = read_concern_1.ReadConcern.fromOptions(options);
    if (readConcern) {
        findCommand.readConcern = readConcern.toJSON();
    }
    if (options.max) {
        findCommand.max = options.max;
    }
    if (options.min) {
        findCommand.min = options.min;
    }
    if (typeof options.returnKey === 'boolean') {
        findCommand.returnKey = options.returnKey;
    }
    if (typeof options.showRecordId === 'boolean') {
        findCommand.showRecordId = options.showRecordId;
    }
    if (typeof options.tailable === 'boolean') {
        findCommand.tailable = options.tailable;
    }
    if (typeof options.oplogReplay === 'boolean') {
        findCommand.oplogReplay = options.oplogReplay;
    }
    if (typeof options.timeout === 'boolean') {
        findCommand.noCursorTimeout = !options.timeout;
    }
    else if (typeof options.noCursorTimeout === 'boolean') {
        findCommand.noCursorTimeout = options.noCursorTimeout;
    }
    if (typeof options.awaitData === 'boolean') {
        findCommand.awaitData = options.awaitData;
    }
    if (typeof options.allowPartialResults === 'boolean') {
        findCommand.allowPartialResults = options.allowPartialResults;
    }
    if (options.collation) {
        findCommand.collation = options.collation;
    }
    if (typeof options.allowDiskUse === 'boolean') {
        findCommand.allowDiskUse = options.allowDiskUse;
    }
    if (options.let) {
        findCommand.let = options.let;
    }
    return findCommand;
}
(0, operation_1.defineAspects)(FindOperation, [
    operation_1.Aspect.READ_OPERATION,
    operation_1.Aspect.RETRYABLE,
    operation_1.Aspect.EXPLAINABLE,
    operation_1.Aspect.CURSOR_CREATING
]);
//# sourceMappingURL=find.js.map