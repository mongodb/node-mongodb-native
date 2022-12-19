"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSharded = exports.applyCommonQueryOptions = exports.getReadPreference = void 0;
const error_1 = require("../../error");
const read_preference_1 = require("../../read_preference");
const common_1 = require("../../sdam/common");
const topology_description_1 = require("../../sdam/topology_description");
function getReadPreference(cmd, options) {
    // Default to command version of the readPreference
    let readPreference = cmd.readPreference || read_preference_1.ReadPreference.primary;
    // If we have an option readPreference override the command one
    if (options === null || options === void 0 ? void 0 : options.readPreference) {
        readPreference = options.readPreference;
    }
    if (typeof readPreference === 'string') {
        readPreference = read_preference_1.ReadPreference.fromString(readPreference);
    }
    if (!(readPreference instanceof read_preference_1.ReadPreference)) {
        throw new error_1.MongoInvalidArgumentError('Option "readPreference" must be a ReadPreference instance');
    }
    return readPreference;
}
exports.getReadPreference = getReadPreference;
function applyCommonQueryOptions(queryOptions, options) {
    Object.assign(queryOptions, {
        raw: typeof options.raw === 'boolean' ? options.raw : false,
        promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
        promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
        promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
        bsonRegExp: typeof options.bsonRegExp === 'boolean' ? options.bsonRegExp : false,
        enableUtf8Validation: typeof options.enableUtf8Validation === 'boolean' ? options.enableUtf8Validation : true
    });
    if (options.session) {
        queryOptions.session = options.session;
    }
    return queryOptions;
}
exports.applyCommonQueryOptions = applyCommonQueryOptions;
function isSharded(topologyOrServer) {
    if (topologyOrServer == null) {
        return false;
    }
    if (topologyOrServer.description && topologyOrServer.description.type === common_1.ServerType.Mongos) {
        return true;
    }
    // NOTE: This is incredibly inefficient, and should be removed once command construction
    //       happens based on `Server` not `Topology`.
    if (topologyOrServer.description && topologyOrServer.description instanceof topology_description_1.TopologyDescription) {
        const servers = Array.from(topologyOrServer.description.servers.values());
        return servers.some((server) => server.type === common_1.ServerType.Mongos);
    }
    return false;
}
exports.isSharded = isSharded;
//# sourceMappingURL=shared.js.map