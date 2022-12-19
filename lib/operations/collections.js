"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionsOperation = void 0;
const collection_1 = require("../collection");
const operation_1 = require("./operation");
/** @internal */
class CollectionsOperation extends operation_1.AbstractOperation {
    constructor(db, options) {
        super(options);
        this.options = options;
        this.db = db;
    }
    execute(server, session, callback) {
        const db = this.db;
        // Let's get the collection names
        db.listCollections({}, { ...this.options, nameOnly: true, readPreference: this.readPreference, session }).toArray((err, documents) => {
            if (err || !documents)
                return callback(err);
            // Filter collections removing any illegal ones
            documents = documents.filter(doc => doc.name.indexOf('$') === -1);
            // Return the collection objects
            callback(undefined, documents.map(d => {
                return new collection_1.Collection(db, d.name, db.s.options);
            }));
        });
    }
}
exports.CollectionsOperation = CollectionsOperation;
//# sourceMappingURL=collections.js.map