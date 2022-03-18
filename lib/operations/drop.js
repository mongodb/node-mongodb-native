"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropDatabaseOperation = exports.DropCollectionOperation = void 0;
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class DropCollectionOperation extends command_1.CommandOperation {
    constructor(db, name, options) {
        super(db, options);
        this.options = options;
        this.name = name;
    }
    execute(server, session, callback) {
        super.executeCommand(server, session, { drop: this.name }, (err, result) => {
            if (err)
                return callback(err);
            if (result.ok)
                return callback(undefined, true);
            callback(undefined, false);
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