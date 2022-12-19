"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilingLevelOperation = void 0;
const error_1 = require("../error");
const command_1 = require("./command");
/** @internal */
class ProfilingLevelOperation extends command_1.CommandOperation {
    constructor(db, options) {
        super(db, options);
        this.options = options;
    }
    execute(server, session, callback) {
        super.executeCommand(server, session, { profile: -1 }, (err, doc) => {
            if (err == null && doc.ok === 1) {
                const was = doc.was;
                if (was === 0)
                    return callback(undefined, 'off');
                if (was === 1)
                    return callback(undefined, 'slow_only');
                if (was === 2)
                    return callback(undefined, 'all');
                // TODO(NODE-3483)
                return callback(new error_1.MongoRuntimeError(`Illegal profiling level value ${was}`));
            }
            else {
                // TODO(NODE-3483): Consider MongoUnexpectedServerResponseError
                err != null ? callback(err) : callback(new error_1.MongoRuntimeError('Error with profile command'));
            }
        });
    }
}
exports.ProfilingLevelOperation = ProfilingLevelOperation;
//# sourceMappingURL=profiling_level.js.map