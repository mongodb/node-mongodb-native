"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvalOperation = void 0;
const bson_1 = require("../bson");
const error_1 = require("../error");
const read_preference_1 = require("../read_preference");
const command_1 = require("./command");
/** @internal */
class EvalOperation extends command_1.CommandOperation {
    constructor(db, code, parameters, options) {
        super(db, options);
        this.options = options !== null && options !== void 0 ? options : {};
        this.code = code;
        this.parameters = parameters;
        // force primary read preference
        Object.defineProperty(this, 'readPreference', {
            value: read_preference_1.ReadPreference.primary,
            configurable: false,
            writable: false
        });
    }
    execute(server, session, callback) {
        let finalCode = this.code;
        let finalParameters = [];
        // If not a code object translate to one
        if (!(finalCode && finalCode._bsontype === 'Code')) {
            finalCode = new bson_1.Code(finalCode);
        }
        // Ensure the parameters are correct
        if (this.parameters != null && typeof this.parameters !== 'function') {
            finalParameters = Array.isArray(this.parameters) ? this.parameters : [this.parameters];
        }
        // Create execution selector
        const cmd = { $eval: finalCode, args: finalParameters };
        // Check if the nolock parameter is passed in
        if (this.options.nolock) {
            cmd.nolock = this.options.nolock;
        }
        // Execute the command
        super.executeCommand(server, session, cmd, (err, result) => {
            if (err)
                return callback(err);
            if (result && result.ok === 1) {
                return callback(undefined, result.retval);
            }
            if (result) {
                callback(new error_1.MongoServerError({ message: `eval failed: ${result.errmsg}` }));
                return;
            }
            callback(err, result);
        });
    }
}
exports.EvalOperation = EvalOperation;
//# sourceMappingURL=eval.js.map