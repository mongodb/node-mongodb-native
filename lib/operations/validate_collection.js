"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidateCollectionOperation = void 0;
const error_1 = require("../error");
const command_1 = require("./command");
/** @internal */
class ValidateCollectionOperation extends command_1.CommandOperation {
    constructor(admin, collectionName, options) {
        // Decorate command with extra options
        const command = { validate: collectionName };
        const keys = Object.keys(options);
        for (let i = 0; i < keys.length; i++) {
            if (Object.prototype.hasOwnProperty.call(options, keys[i]) && keys[i] !== 'session') {
                command[keys[i]] = options[keys[i]];
            }
        }
        super(admin.s.db, options);
        this.options = options;
        this.command = command;
        this.collectionName = collectionName;
    }
    execute(server, session, callback) {
        const collectionName = this.collectionName;
        super.executeCommand(server, session, this.command, (err, doc) => {
            if (err != null)
                return callback(err);
            // TODO(NODE-3483): Replace these with MongoUnexpectedServerResponseError
            if (doc.ok === 0)
                return callback(new error_1.MongoRuntimeError('Error with validate command'));
            if (doc.result != null && typeof doc.result !== 'string')
                return callback(new error_1.MongoRuntimeError('Error with validation data'));
            if (doc.result != null && doc.result.match(/exception|corrupt/) != null)
                return callback(new error_1.MongoRuntimeError(`Invalid collection ${collectionName}`));
            if (doc.valid != null && !doc.valid)
                return callback(new error_1.MongoRuntimeError(`Invalid collection ${collectionName}`));
            return callback(undefined, doc);
        });
    }
}
exports.ValidateCollectionOperation = ValidateCollectionOperation;
//# sourceMappingURL=validate_collection.js.map