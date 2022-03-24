"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveUserOperation = void 0;
const command_1 = require("./command");
const operation_1 = require("./operation");
/** @internal */
class RemoveUserOperation extends command_1.CommandOperation {
    constructor(db, username, options) {
        super(db, options);
        this.options = options;
        this.username = username;
    }
    execute(server, session, callback) {
        super.executeCommand(server, session, { dropUser: this.username }, err => {
            callback(err, err ? false : true);
        });
    }
}
exports.RemoveUserOperation = RemoveUserOperation;
(0, operation_1.defineAspects)(RemoveUserOperation, [operation_1.Aspect.WRITE_OPERATION]);
//# sourceMappingURL=remove_user.js.map