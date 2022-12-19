"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetProfilingLevelOperation = exports.ProfilingLevel = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
const command_1 = require("./command");
const levelValues = new Set(['off', 'slow_only', 'all']);
/** @public */
exports.ProfilingLevel = Object.freeze({
    off: 'off',
    slowOnly: 'slow_only',
    all: 'all'
});
/** @internal */
class SetProfilingLevelOperation extends command_1.CommandOperation {
    constructor(db, level, options) {
        super(db, options);
        this.options = options;
        switch (level) {
            case exports.ProfilingLevel.off:
                this.profile = 0;
                break;
            case exports.ProfilingLevel.slowOnly:
                this.profile = 1;
                break;
            case exports.ProfilingLevel.all:
                this.profile = 2;
                break;
            default:
                this.profile = 0;
                break;
        }
        this.level = level;
    }
    execute(server, session, callback) {
        const level = this.level;
        if (!levelValues.has(level)) {
            return callback(new error_1.MongoInvalidArgumentError(`Profiling level must be one of "${(0, utils_1.enumToString)(exports.ProfilingLevel)}"`));
        }
        // TODO(NODE-3483): Determine error to put here
        super.executeCommand(server, session, { profile: this.profile }, (err, doc) => {
            if (err == null && doc.ok === 1)
                return callback(undefined, level);
            return err != null
                ? callback(err)
                : callback(new error_1.MongoRuntimeError('Error with profile command'));
        });
    }
}
exports.SetProfilingLevelOperation = SetProfilingLevelOperation;
//# sourceMappingURL=set_profiling_level.js.map