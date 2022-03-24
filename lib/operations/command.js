"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandOperation = void 0;
const error_1 = require("../error");
const explain_1 = require("../explain");
const read_concern_1 = require("../read_concern");
const server_selection_1 = require("../sdam/server_selection");
const utils_1 = require("../utils");
const write_concern_1 = require("../write_concern");
const operation_1 = require("./operation");
const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;
/** @internal */
class CommandOperation extends operation_1.AbstractOperation {
    constructor(parent, options) {
        super(options);
        this.options = options !== null && options !== void 0 ? options : {};
        // NOTE: this was explicitly added for the add/remove user operations, it's likely
        //       something we'd want to reconsider. Perhaps those commands can use `Admin`
        //       as a parent?
        const dbNameOverride = (options === null || options === void 0 ? void 0 : options.dbName) || (options === null || options === void 0 ? void 0 : options.authdb);
        if (dbNameOverride) {
            this.ns = new utils_1.MongoDBNamespace(dbNameOverride, '$cmd');
        }
        else {
            this.ns = parent
                ? parent.s.namespace.withCollection('$cmd')
                : new utils_1.MongoDBNamespace('admin', '$cmd');
        }
        this.readConcern = read_concern_1.ReadConcern.fromOptions(options);
        this.writeConcern = write_concern_1.WriteConcern.fromOptions(options);
        // TODO(NODE-2056): make logger another "inheritable" property
        if (parent && parent.logger) {
            this.logger = parent.logger;
        }
        if (this.hasAspect(operation_1.Aspect.EXPLAINABLE)) {
            this.explain = explain_1.Explain.fromOptions(options);
        }
        else if ((options === null || options === void 0 ? void 0 : options.explain) != null) {
            throw new error_1.MongoInvalidArgumentError(`Option "explain" is not supported on this command`);
        }
    }
    get canRetryWrite() {
        if (this.hasAspect(operation_1.Aspect.EXPLAINABLE)) {
            return this.explain == null;
        }
        return true;
    }
    executeCommand(server, session, cmd, callback) {
        // TODO: consider making this a non-enumerable property
        this.server = server;
        const options = {
            ...this.options,
            ...this.bsonOptions,
            readPreference: this.readPreference,
            session
        };
        const serverWireVersion = (0, utils_1.maxWireVersion)(server);
        const inTransaction = this.session && this.session.inTransaction();
        if (this.readConcern && (0, utils_1.commandSupportsReadConcern)(cmd) && !inTransaction) {
            Object.assign(cmd, { readConcern: this.readConcern });
        }
        if (this.trySecondaryWrite && serverWireVersion < server_selection_1.MIN_SECONDARY_WRITE_WIRE_VERSION) {
            options.omitReadPreference = true;
        }
        if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
            callback(new error_1.MongoCompatibilityError(`Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`));
            return;
        }
        if (this.writeConcern && this.hasAspect(operation_1.Aspect.WRITE_OPERATION) && !inTransaction) {
            Object.assign(cmd, { writeConcern: this.writeConcern });
        }
        if (serverWireVersion >= SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
            if (options.collation &&
                typeof options.collation === 'object' &&
                !this.hasAspect(operation_1.Aspect.SKIP_COLLATION)) {
                Object.assign(cmd, { collation: options.collation });
            }
        }
        if (typeof options.maxTimeMS === 'number') {
            cmd.maxTimeMS = options.maxTimeMS;
        }
        if (typeof options.comment === 'string') {
            cmd.comment = options.comment;
        }
        if (this.hasAspect(operation_1.Aspect.EXPLAINABLE) && this.explain) {
            if (serverWireVersion < 6 && cmd.aggregate) {
                // Prior to 3.6, with aggregate, verbosity is ignored, and we must pass in "explain: true"
                cmd.explain = true;
            }
            else {
                cmd = (0, utils_1.decorateWithExplain)(cmd, this.explain);
            }
        }
        server.command(this.ns, cmd, options, callback);
    }
}
exports.CommandOperation = CommandOperation;
//# sourceMappingURL=command.js.map