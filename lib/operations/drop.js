"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropDatabaseOperation = exports.DropCollectionOperation = void 0;
const error_1 = require("../error");
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class DropCollectionOperation extends command_1.CommandOperation {
    constructor(db, name, options = {}) {
        super(db, options);
        this.db = db;
        this.options = options;
        this.name = name;
    }
    execute(server, session, callback) {
        (async () => {
            var _a, _b, _c, _d;
            const db = this.db;
            const options = this.options;
            const name = this.name;
            const encryptedFieldsMap = (_a = db.s.client.options.autoEncryption) === null || _a === void 0 ? void 0 : _a.encryptedFieldsMap;
            let encryptedFields = (_b = options.encryptedFields) !== null && _b !== void 0 ? _b : encryptedFieldsMap === null || encryptedFieldsMap === void 0 ? void 0 : encryptedFieldsMap[`${db.databaseName}.${name}`];
            if (!encryptedFields && encryptedFieldsMap) {
                // If the MongoClient was configured with an encryptedFieldsMap,
                // and no encryptedFields config was available in it or explicitly
                // passed as an argument, the spec tells us to look one up using
                // listCollections().
                const listCollectionsResult = await db
                    .listCollections({ name }, { nameOnly: false })
                    .toArray();
                encryptedFields = (_d = (_c = listCollectionsResult === null || listCollectionsResult === void 0 ? void 0 : listCollectionsResult[0]) === null || _c === void 0 ? void 0 : _c.options) === null || _d === void 0 ? void 0 : _d.encryptedFields;
            }
            if (encryptedFields) {
                const escCollection = encryptedFields.escCollection || `enxcol_.${name}.esc`;
                const eccCollection = encryptedFields.eccCollection || `enxcol_.${name}.ecc`;
                const ecocCollection = encryptedFields.ecocCollection || `enxcol_.${name}.ecoc`;
                for (const collectionName of [escCollection, eccCollection, ecocCollection]) {
                    // Drop auxilliary collections, ignoring potential NamespaceNotFound errors.
                    const dropOp = new DropCollectionOperation(db, collectionName);
                    try {
                        await dropOp.executeWithoutEncryptedFieldsCheck(server, session);
                    }
                    catch (err) {
                        if (!(err instanceof error_1.MongoServerError) ||
                            err.code !== error_1.MONGODB_ERROR_CODES.NamespaceNotFound) {
                            throw err;
                        }
                    }
                }
            }
            return this.executeWithoutEncryptedFieldsCheck(server, session);
        })().then(result => callback(undefined, result), err => callback(err));
    }
    executeWithoutEncryptedFieldsCheck(server, session) {
        return new Promise((resolve, reject) => {
            super.executeCommand(server, session, { drop: this.name }, (err, result) => {
                if (err)
                    return reject(err);
                resolve(!!result.ok);
            });
        });
    }
}
exports.DropCollectionOperation = DropCollectionOperation;
/** @internal */
class DropDatabaseOperation extends command_1.CommandOperation {
    constructor(db, options) {
        super(db, options);
        this.options = options;
    }
    execute(server, session, callback) {
        super.executeCommand(server, session, { dropDatabase: 1 }, (err, result) => {
            if (err)
                return callback(err);
            if (result.ok)
                return callback(undefined, true);
            callback(undefined, false);
        });
    }
}
exports.DropDatabaseOperation = DropDatabaseOperation;
(0, operation_1.defineAspects)(DropCollectionOperation, [operation_1.Aspect.WRITE_OPERATION]);
(0, operation_1.defineAspects)(DropDatabaseOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=drop.js.map