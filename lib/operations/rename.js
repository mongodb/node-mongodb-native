"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenameOperation = void 0;
const collection_1 = require("../collection");
const error_1 = require("../error");
const utils_1 = require("../utils");
const operation_1 = require("./operation");
const run_command_1 = require("./run_command");
/** @internal */
class RenameOperation extends run_command_1.RunAdminCommandOperation {
    constructor(collection, newName, options) {
        // Check the collection name
        (0, utils_1.checkCollectionName)(newName);
        // Build the command
        const renameCollection = collection.namespace;
        const toCollection = collection.s.namespace.withCollection(newName).toString();
        const dropTarget = typeof options.dropTarget === 'boolean' ? options.dropTarget : false;
        const cmd = { renameCollection: renameCollection, to: toCollection, dropTarget: dropTarget };
        super(collection, cmd, options);
        this.options = options;
        this.collection = collection;
        this.newName = newName;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        super.execute(server, session, (err, doc) => {
            if (err)
                return callback(err);
            // We have an error
            if (doc === null || doc === void 0 ? void 0 : doc.errmsg) {
                return callback(new error_1.MongoServerError(doc));
            }
            let newColl;
            try {
                newColl = new collection_1.Collection(coll.s.db, this.newName, coll.s.options);
            }
            catch (err) {
                return callback(err);
            }
            return callback(undefined, newColl);
        });
    }
}
exports.RenameOperation = RenameOperation;
(0, operation_1.defineAspects)(RenameOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=rename.js.map