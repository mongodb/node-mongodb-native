"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareTopologyVersion = exports.parseServerType = exports.ServerDescription = void 0;
const bson_1 = require("../bson");
const error_1 = require("../error");
const utils_1 = require("../utils");
const common_1 = require("./common");
const WRITABLE_SERVER_TYPES = new Set([
    common_1.ServerType.RSPrimary,
    common_1.ServerType.Standalone,
    common_1.ServerType.Mongos,
    common_1.ServerType.LoadBalancer
]);
const DATA_BEARING_SERVER_TYPES = new Set([
    common_1.ServerType.RSPrimary,
    common_1.ServerType.RSSecondary,
    common_1.ServerType.Mongos,
    common_1.ServerType.Standalone,
    common_1.ServerType.LoadBalancer
]);
/**
 * The client's view of a single server, based on the most recent hello outcome.
 *
 * Internal type, not meant to be directly instantiated
 * @public
 */
class ServerDescription {
    /**
     * Create a ServerDescription
     * @internal
     *
     * @param address - The address of the server
     * @param hello - An optional hello response for this server
     */
    constructor(address, hello, options = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
        if (address == null || address === '') {
            throw new error_1.MongoRuntimeError('ServerDescription must be provided with a non-empty address');
        }
        this.address =
            typeof address === 'string'
                ? utils_1.HostAddress.fromString(address).toString() // Use HostAddress to normalize
                : address.toString();
        this.type = parseServerType(hello, options);
        this.hosts = (_b = (_a = hello === null || hello === void 0 ? void 0 : hello.hosts) === null || _a === void 0 ? void 0 : _a.map((host) => host.toLowerCase())) !== null && _b !== void 0 ? _b : [];
        this.passives = (_d = (_c = hello === null || hello === void 0 ? void 0 : hello.passives) === null || _c === void 0 ? void 0 : _c.map((host) => host.toLowerCase())) !== null && _d !== void 0 ? _d : [];
        this.arbiters = (_f = (_e = hello === null || hello === void 0 ? void 0 : hello.arbiters) === null || _e === void 0 ? void 0 : _e.map((host) => host.toLowerCase())) !== null && _f !== void 0 ? _f : [];
        this.tags = (_g = hello === null || hello === void 0 ? void 0 : hello.tags) !== null && _g !== void 0 ? _g : {};
        this.minWireVersion = (_h = hello === null || hello === void 0 ? void 0 : hello.minWireVersion) !== null && _h !== void 0 ? _h : 0;
        this.maxWireVersion = (_j = hello === null || hello === void 0 ? void 0 : hello.maxWireVersion) !== null && _j !== void 0 ? _j : 0;
        this.roundTripTime = (_k = options === null || options === void 0 ? void 0 : options.roundTripTime) !== null && _k !== void 0 ? _k : -1;
        this.lastUpdateTime = (0, utils_1.now)();
        this.lastWriteDate = (_m = (_l = hello === null || hello === void 0 ? void 0 : hello.lastWrite) === null || _l === void 0 ? void 0 : _l.lastWriteDate) !== null && _m !== void 0 ? _m : 0;
        this.error = (_o = options.error) !== null && _o !== void 0 ? _o : null;
        // TODO(NODE-2674): Preserve int64 sent from MongoDB
        this.topologyVersion = (_r = (_q = (_p = this.error) === null || _p === void 0 ? void 0 : _p.topologyVersion) !== null && _q !== void 0 ? _q : hello === null || hello === void 0 ? void 0 : hello.topologyVersion) !== null && _r !== void 0 ? _r : null;
        this.setName = (_s = hello === null || hello === void 0 ? void 0 : hello.setName) !== null && _s !== void 0 ? _s : null;
        this.setVersion = (_t = hello === null || hello === void 0 ? void 0 : hello.setVersion) !== null && _t !== void 0 ? _t : null;
        this.electionId = (_u = hello === null || hello === void 0 ? void 0 : hello.electionId) !== null && _u !== void 0 ? _u : null;
        this.logicalSessionTimeoutMinutes = (_v = hello === null || hello === void 0 ? void 0 : hello.logicalSessionTimeoutMinutes) !== null && _v !== void 0 ? _v : null;
        this.primary = (_w = hello === null || hello === void 0 ? void 0 : hello.primary) !== null && _w !== void 0 ? _w : null;
        this.me = (_y = (_x = hello === null || hello === void 0 ? void 0 : hello.me) === null || _x === void 0 ? void 0 : _x.toLowerCase()) !== null && _y !== void 0 ? _y : null;
        this.$clusterTime = (_z = hello === null || hello === void 0 ? void 0 : hello.$clusterTime) !== null && _z !== void 0 ? _z : null;
    }
    get hostAddress() {
        return utils_1.HostAddress.fromString(this.address);
    }
    get allHosts() {
        return this.hosts.concat(this.arbiters).concat(this.passives);
    }
    /** Is this server available for reads*/
    get isReadable() {
        return this.type === common_1.ServerType.RSSecondary || this.isWritable;
    }
    /** Is this server data bearing */
    get isDataBearing() {
        return DATA_BEARING_SERVER_TYPES.has(this.type);
    }
    /** Is this server available for writes */
    get isWritable() {
        return WRITABLE_SERVER_TYPES.has(this.type);
    }
    get host() {
        const chopLength = `:${this.port}`.length;
        return this.address.slice(0, -chopLength);
    }
    get port() {
        const port = this.address.split(':').pop();
        return port ? Number.parseInt(port, 10) : 27017;
    }
    /**
     * Determines if another `ServerDescription` is equal to this one per the rules defined
     * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
     */
    equals(other) {
        // Despite using the comparator that would determine a nullish topologyVersion as greater than
        // for equality we should only always perform direct equality comparison
        const topologyVersionsEqual = this.topologyVersion === (other === null || other === void 0 ? void 0 : other.topologyVersion) ||
            compareTopologyVersion(this.topologyVersion, other === null || other === void 0 ? void 0 : other.topologyVersion) === 0;
        const electionIdsEqual = this.electionId != null && (other === null || other === void 0 ? void 0 : other.electionId) != null
            ? (0, utils_1.compareObjectId)(this.electionId, other.electionId) === 0
            : this.electionId === (other === null || other === void 0 ? void 0 : other.electionId);
        return (other != null &&
            (0, utils_1.errorStrictEqual)(this.error, other.error) &&
            this.type === other.type &&
            this.minWireVersion === other.minWireVersion &&
            (0, utils_1.arrayStrictEqual)(this.hosts, other.hosts) &&
            tagsStrictEqual(this.tags, other.tags) &&
            this.setName === other.setName &&
            this.setVersion === other.setVersion &&
            electionIdsEqual &&
            this.primary === other.primary &&
            this.logicalSessionTimeoutMinutes === other.logicalSessionTimeoutMinutes &&
            topologyVersionsEqual);
    }
}
exports.ServerDescription = ServerDescription;
// Parses a `hello` message and determines the server type
function parseServerType(hello, options) {
    if (options === null || options === void 0 ? void 0 : options.loadBalanced) {
        return common_1.ServerType.LoadBalancer;
    }
    if (!hello || !hello.ok) {
        return common_1.ServerType.Unknown;
    }
    if (hello.isreplicaset) {
        return common_1.ServerType.RSGhost;
    }
    if (hello.msg && hello.msg === 'isdbgrid') {
        return common_1.ServerType.Mongos;
    }
    if (hello.setName) {
        if (hello.hidden) {
            return common_1.ServerType.RSOther;
        }
        else if (hello.isWritablePrimary) {
            return common_1.ServerType.RSPrimary;
        }
        else if (hello.secondary) {
            return common_1.ServerType.RSSecondary;
        }
        else if (hello.arbiterOnly) {
            return common_1.ServerType.RSArbiter;
        }
        else {
            return common_1.ServerType.RSOther;
        }
    }
    return common_1.ServerType.Standalone;
}
exports.parseServerType = parseServerType;
function tagsStrictEqual(tags, tags2) {
    const tagsKeys = Object.keys(tags);
    const tags2Keys = Object.keys(tags2);
    return (tagsKeys.length === tags2Keys.length &&
        tagsKeys.every((key) => tags2[key] === tags[key]));
}
/**
 * Compares two topology versions.
 *
 * 1. If the response topologyVersion is unset or the ServerDescription's
 *    topologyVersion is null, the client MUST assume the response is more recent.
 * 1. If the response's topologyVersion.processId is not equal to the
 *    ServerDescription's, the client MUST assume the response is more recent.
 * 1. If the response's topologyVersion.processId is equal to the
 *    ServerDescription's, the client MUST use the counter field to determine
 *    which topologyVersion is more recent.
 *
 * ```ts
 * currentTv <   newTv === -1
 * currentTv === newTv === 0
 * currentTv >   newTv === 1
 * ```
 */
function compareTopologyVersion(currentTv, newTv) {
    if (currentTv == null || newTv == null) {
        return -1;
    }
    if (!currentTv.processId.equals(newTv.processId)) {
        return -1;
    }
    // TODO(NODE-2674): Preserve int64 sent from MongoDB
    const currentCounter = bson_1.Long.isLong(currentTv.counter)
        ? currentTv.counter
        : bson_1.Long.fromNumber(currentTv.counter);
    const newCounter = bson_1.Long.isLong(newTv.counter) ? newTv.counter : bson_1.Long.fromNumber(newTv.counter);
    return currentCounter.compare(newCounter);
}
exports.compareTopologyVersion = compareTopologyVersion;
//# sourceMappingURL=server_description.js.map