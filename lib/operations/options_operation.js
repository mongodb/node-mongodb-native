"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionsOperation = void 0;
const error_1 = require("../error");
const operation_1 = require("./operation");
/** @internal */
class OptionsOperation extends operation_1.AbstractOperation {
    constructor(collection, options) {
        super(options);
        this.options = options;
        this.collection = collection;
    }
    execute(server, session, callback) {
        const coll = this.collection;
        coll.s.db
            .listCollections({ name: coll.collectionName }, { ...this.options, nameOnly: false, readPreference: this.readPreference, session })
            .toArray((err, collections) => {
            if (err || !collections)
                return callback(err);
            if (collections.length === 0) {
                // TODO(NODE-3485)
                return callback(new error_1.MongoAPIError(`collection ${coll.namespace} not found`));
            }
            callback(err, collections[0].options);
        });
    }
}
exports.OptionsOperation = OptionsOperation;
//# sourceMappingURL=options_operation.js.map