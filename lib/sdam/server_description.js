"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareTopologyVersion = exports.parseServerType = exports.ServerDescription = void 0;
const bson_1 = require("../bson");
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
    constructor(address, hello, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (typeof address === 'string') {
            this._hostAddress = new utils_1.HostAddress(address);
            this.address = this._hostAddress.toString();
        }
        else {
            this._hostAddress = address;
            this.address = this._hostAddress.toString();
        }
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
        if (options === null || options === void 0 ? void 0 : options.topologyVersion) {
            this.topologyVersion = options.topologyVersion;
        }
        else if (hello === null || hello === void 0 ? void 0 : hello.topologyVersion) {
            this.topologyVersion = hello.topologyVersion;
        }
        if (options === null || options === void 0 ? void 0 : options.error) {
            this.error = options.error;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.primary) {
            this.primary = hello.primary;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.me) {
            this.me = hello.me.toLowerCase();
        }
        if (hello === null || hello === void 0 ? void 0 : hello.setName) {
            this.setName = hello.setName;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.setVersion) {
            this.setVersion = hello.setVersion;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.electionId) {
            this.electionId = hello.electionId;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.logicalSessionTimeoutMinutes) {
            this.logicalSessionTimeoutMinutes = hello.logicalSessionTimeoutMinutes;
        }
        if (hello === null || hello === void 0 ? void 0 : hello.$clusterTime) {
            this.$clusterTime = hello.$clusterTime;
        }
    }
    get hostAddress() {
        if (this._hostAddress)
            return this._hostAddress;
        else
            return new utils_1.HostAddress(this.address);
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
        const topologyVersionsEqual = this.topologyVersion === other.topologyVersion ||
            compareTopologyVersion(this.topologyVersion, other.topologyVersion) === 0;
        const electionIdsEqual = this.electionId && other.electionId
            ? other.electionId && this.electionId.equals(other.electionId)
            : this.electionId === other.electionId;
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
 * @returns A negative number if `lhs` is older than `rhs`; positive if `lhs` is newer than `rhs`; 0 if they are equivalent.
 */
function compareTopologyVersion(lhs, rhs) {
    if (lhs == null || rhs == null) {
        return -1;
    }
    if (lhs.processId.equals(rhs.processId)) {
        // tests mock counter as just number, but in a real situation counter should always be a Long
        const lhsCounter = bson_1.Long.isLong(lhs.counter) ? lhs.counter : bson_1.Long.fromNumber(lhs.counter);
        const rhsCounter = bson_1.Long.isLong(rhs.counter) ? lhs.counter : bson_1.Long.fromNumber(rhs.counter);
        return lhsCounter.compare(rhsCounter);
    }
    return -1;
}
exports.compareTopologyVersion = compareTopologyVersion;
//# sourceMappingURL=server_description.js.map