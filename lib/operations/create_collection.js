"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateCollectionOperation = void 0;
const collection_1 = require("../collection");
const command_1 = require("./command");
const operation_1 = require("./operation");
const ILLEGAL_COMMAND_FIELDS = new Set([
    'w',
    'wtimeout',
    'j',
    'fsync',
    'autoIndexId',
    'pkFactory',
    'raw',
    'readPreference',
    'session',
    'readConcern',
    'writeConcern',
    'raw',
    'fieldsAsRaw',
    'promoteLongs',
    'promoteValues',
    'promoteBuffers',
    'bsonRegExp',
    'serializeFunctions',
    'ignoreUndefined',
    'enableUtf8Validation'
]);
/** @internal */
class CreateCollectionOperation extends command_1.CommandOperation {
    constructor(db, name, options = {}) {
        super(db, options);
        this.options = options;
        this.db = db;
        this.name = name;
    }
    execute(server, session, callback) {
        const db = this.db;
        const name = this.name;
        const options = this.options;
        const done = err => {
            if (err) {
                return callback(err);
            }
            callback(undefined, new collection_1.Collection(db, name, options));
        };
        const cmd = { create: name };
        for (const n in options) {
            if (options[n] != null &&
                typeof options[n] !== 'function' &&
                !ILLEGAL_COMMAND_FIELDS.has(n)) {
                cmd[n] = options[n];
            }
        }
        // otherwise just execute the command
        super.executeCommand(server, session, cmd, done);
    }
}
exports.CreateCollectionOperation = CreateCollectionOperation;
(0, operation_1.defineAspects)(CreateCollectionOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=create_collection.js.map