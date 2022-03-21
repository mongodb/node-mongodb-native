"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetMoreOperation = void 0;
const error_1 = require("../error");
const operation_1 = require("./operation");
/** @internal */
class GetMoreOperation extends operation_1.AbstractOperation {
    constructor(ns, cursorId, server, options = {}) {
        super(options);
        this.options = options;
        this.ns = ns;
        this.cursorId = cursorId;
        this.server = server;
    }
    /**
     * Although there is a server already associated with the get more operation, the signature
     * for execute passes a server so we will just use that one.
     */
    execute(server, session, callback) {
        if (server !== this.server) {
            return callback(new error_1.MongoRuntimeError('Getmore must run on the same server operation began on'));
        }
        server.getMore(this.ns, this.cursorId, this.options, callback);
    }
}
exports.GetMoreOperation = GetMoreOperation;
(0, operation_1.defineAspects)(GetMoreOperation, [operation_1.Aspect.READ_OPERATION, operation_1.Aspect.CURSOR_ITERATING]);
//# sourceMappingURL=get_more.js.map