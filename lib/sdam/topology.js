"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerCapabilities = exports.Topology = void 0;
const Denque = require("denque");
const bson_1 = require("../bson");
const connection_string_1 = require("../connection_string");
const constants_1 = require("../constants");
const error_1 = require("../error");
const mongo_types_1 = require("../mongo_types");
const read_preference_1 = require("../read_preference");
const sessions_1 = require("../sessions");
const utils_1 = require("../utils");
const common_1 = require("./common");
const events_1 = require("./events");
const server_1 = require("./server");
const server_description_1 = require("./server_description");
const server_selection_1 = require("./server_selection");
const srv_polling_1 = require("./srv_polling");
const topology_description_1 = require("./topology_description");
// Global state
let globalTopologyCounter = 0;
const stateTransition = (0, utils_1.makeStateMachine)({
    [common_1.STATE_CLOSED]: [common_1.STATE_CLOSED, common_1.STATE_CONNECTING],
    [common_1.STATE_CONNECTING]: [common_1.STATE_CONNECTING, common_1.STATE_CLOSING, common_1.STATE_CONNECTED, common_1.STATE_CLOSED],
    [common_1.STATE_CONNECTED]: [common_1.STATE_CONNECTED, common_1.STATE_CLOSING, common_1.STATE_CLOSED],
    [common_1.STATE_CLOSING]: [common_1.STATE_CLOSING, common_1.STATE_CLOSED]
});
/** @internal */
const kCancelled = Symbol('cancelled');
/** @internal */
const kWaitQueue = Symbol('waitQueue');
/**
 * A container of server instances representing a connection to a MongoDB topology.
 * @internal
 */
class Topology extends mongo_types_1.TypedEventEmitter {
    /**
     * @param seedlist - a list of HostAddress instances to connect to
     */
    constructor(seeds, options) {
        var _a;
        super();
        // Legacy CSFLE support
        this.bson = Object.create(null);
        this.bson.serialize = bson_1.serialize;
        this.bson.deserialize = bson_1.deserialize;
        // Options should only be undefined in tests, MongoClient will always have defined options
        options = options !== null && options !== void 0 ? options : {
            hosts: [utils_1.HostAddress.fromString('localhost:27017')],
            retryReads: connection_string_1.DEFAULT_OPTIONS.get('retryReads'),
            retryWrites: connection_string_1.DEFAULT_OPTIONS.get('retryWrites'),
            serverSelectionTimeoutMS: connection_string_1.DEFAULT_OPTIONS.get('serverSelectionTimeoutMS'),
            directConnection: connection_string_1.DEFAULT_OPTIONS.get('directConnection'),
            loadBalanced: connection_string_1.DEFAULT_OPTIONS.get('loadBalanced'),
            metadata: connection_string_1.DEFAULT_OPTIONS.get('metadata'),
            monitorCommands: connection_string_1.DEFAULT_OPTIONS.get('monitorCommands'),
            tls: connection_string_1.DEFAULT_OPTIONS.get('tls'),
            maxPoolSize: connection_string_1.DEFAULT_OPTIONS.get('maxPoolSize'),
            minPoolSize: connection_string_1.DEFAULT_OPTIONS.get('minPoolSize'),
            waitQueueTimeoutMS: connection_string_1.DEFAULT_OPTIONS.get('waitQueueTimeoutMS'),
            connectionType: connection_string_1.DEFAULT_OPTIONS.get('connectionType'),
            connectTimeoutMS: connection_string_1.DEFAULT_OPTIONS.get('connectTimeoutMS'),
            maxIdleTimeMS: connection_string_1.DEFAULT_OPTIONS.get('maxIdleTimeMS'),
            heartbeatFrequencyMS: connection_string_1.DEFAULT_OPTIONS.get('heartbeatFrequencyMS'),
            minHeartbeatFrequencyMS: connection_string_1.DEFAULT_OPTIONS.get('minHeartbeatFrequencyMS')
        };
        if (typeof seeds === 'string') {
            seeds = [utils_1.HostAddress.fromString(seeds)];
        }
        else if (!Array.isArray(seeds)) {
            seeds = [seeds];
        }
        const seedlist = [];
        for (const seed of seeds) {
            if (typeof seed === 'string') {
                seedlist.push(utils_1.HostAddress.fromString(seed));
            }
            else if (seed instanceof utils_1.HostAddress) {
                seedlist.push(seed);
            }
            else {
                // FIXME(NODE-3483): May need to be a MongoParseError
                throw new error_1.MongoRuntimeError(`Topology cannot be constructed from ${JSON.stringify(seed)}`);
            }
        }
        const topologyType = topologyTypeFromOptions(options);
        const topologyId = globalTopologyCounter++;
        const selectedHosts = options.srvMaxHosts == null ||
            options.srvMaxHosts === 0 ||
            options.srvMaxHosts >= seedlist.length
            ? seedlist
            : (0, utils_1.shuffle)(seedlist, options.srvMaxHosts);
        const serverDescriptions = new Map();
        for (const hostAddress of selectedHosts) {
            serverDescriptions.set(hostAddress.toString(), new server_description_1.ServerDescription(hostAddress));
        }
        this[kWaitQueue] = new Denque();
        this.s = {
            // the id of this topology
            id: topologyId,
            // passed in options
            options,
            // initial seedlist of servers to connect to
            seedlist,
            // initial state
            state: common_1.STATE_CLOSED,
            // the topology description
            description: new topology_description_1.TopologyDescription(topologyType, serverDescriptions, options.replicaSet, undefined, undefined, undefined, options),
            serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
            heartbeatFrequencyMS: options.heartbeatFrequencyMS,
            minHeartbeatFrequencyMS: options.minHeartbeatFrequencyMS,
            // a map of server instances to normalized addresses
            servers: new Map(),
            // Server Session Pool
            sessionPool: new sessions_1.ServerSessionPool(this),
            // Active client sessions
            sessions: new Set(),
            credentials: options === null || options === void 0 ? void 0 : options.credentials,
            clusterTime: undefined,
            // timer management
            connectionTimers: new Set(),
            detectShardedTopology: ev => this.detectShardedTopology(ev),
            detectSrvRecords: ev => this.detectSrvRecords(ev)
        };
        if (options.srvHost && !options.loadBalanced) {
            this.s.srvPoller =
                (_a = options.srvPoller) !== null && _a !== void 0 ? _a : new srv_polling_1.SrvPoller({
                    heartbeatFrequencyMS: this.s.heartbeatFrequencyMS,
                    srvHost: options.srvHost,
                    srvMaxHosts: options.srvMaxHosts,
                    srvServiceName: options.srvServiceName
                });
            this.on(Topology.TOPOLOGY_DESCRIPTION_CHANGED, this.s.detectShardedTopology);
        }
    }
    detectShardedTopology(event) {
        var _a, _b, _c;
        const previousType = event.previousDescription.type;
        const newType = event.newDescription.type;
        const transitionToSharded = previousType !== common_1.TopologyType.Sharded && newType === common_1.TopologyType.Sharded;
        const srvListeners = (_a = this.s.srvPoller) === null || _a === void 0 ? void 0 : _a.listeners(srv_polling_1.SrvPoller.SRV_RECORD_DISCOVERY);
        const listeningToSrvPolling = !!(srvListeners === null || srvListeners === void 0 ? void 0 : srvListeners.includes(this.s.detectSrvRecords));
        if (transitionToSharded && !listeningToSrvPolling) {
            (_b = this.s.srvPoller) === null || _b === void 0 ? void 0 : _b.on(srv_polling_1.SrvPoller.SRV_RECORD_DISCOVERY, this.s.detectSrvRecords);
            (_c = this.s.srvPoller) === null || _c === void 0 ? void 0 : _c.start();
        }
    }
    detectSrvRecords(ev) {
        const previousTopologyDescription = this.s.description;
        this.s.description = this.s.description.updateFromSrvPollingEvent(ev, this.s.options.srvMaxHosts);
        if (this.s.description === previousTopologyDescription) {
            // Nothing changed, so return
            return;
        }
        updateServers(this);
        this.emit(Topology.TOPOLOGY_DESCRIPTION_CHANGED, new events_1.TopologyDescriptionChangedEvent(this.s.id, previousTopologyDescription, this.s.description));
    }
    /**
     * @returns A `TopologyDescription` for this topology
     */
    get description() {
        return this.s.description;
    }
    get loadBalanced() {
        return this.s.options.loadBalanced;
    }
    get capabilities() {
        return new ServerCapabilities(this.lastHello());
    }
    /** Initiate server connect */
    connect(options, callback) {
        var _a;
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        if (this.s.state === common_1.STATE_CONNECTED) {
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
        stateTransition(this, common_1.STATE_CONNECTING);
        // emit SDAM monitoring events
        this.emit(Topology.TOPOLOGY_OPENING, new events_1.TopologyOpeningEvent(this.s.id));
        // emit an event for the topology change
        this.emit(Topology.TOPOLOGY_DESCRIPTION_CHANGED, new events_1.TopologyDescriptionChangedEvent(this.s.id, new topology_description_1.TopologyDescription(common_1.TopologyType.Unknown), // initial is always Unknown
        this.s.description));
        // connect all known servers, then attempt server selection to connect
        const serverDescriptions = Array.from(this.s.description.servers.values());
        this.s.servers = new Map(serverDescriptions.map(serverDescription => [
            serverDescription.address,
            createAndConnectServer(this, serverDescription)
        ]));
        // In load balancer mode we need to fake a server description getting
        // emitted from the monitor, since the monitor doesn't exist.
        if (this.s.options.loadBalanced) {
            for (const description of serverDescriptions) {
                const newDescription = new server_description_1.ServerDescription(description.hostAddress, undefined, {
                    loadBalanced: this.s.options.loadBalanced
                });
                this.serverUpdateHandler(newDescription);
            }
        }
        const readPreference = (_a = options.readPreference) !== null && _a !== void 0 ? _a : read_preference_1.ReadPreference.primary;
        this.selectServer((0, server_selection_1.readPreferenceServerSelector)(readPreference), options, (err, server) => {
            if (err) {
                this.close();
                typeof callback === 'function' ? callback(err) : this.emit(Topology.ERROR, err);
                return;
            }
            // TODO: NODE-2471
            if (server && this.s.credentials) {
                server.command((0, utils_1.ns)('admin.$cmd'), { ping: 1 }, {}, err => {
                    if (err) {
                        typeof callback === 'function' ? callback(err) : this.emit(Topology.ERROR, err);
                        return;
                    }
                    stateTransition(this, common_1.STATE_CONNECTED);
                    this.emit(Topology.OPEN, this);
                    this.emit(Topology.CONNECT, this);
                    if (typeof callback === 'function')
                        callback(undefined, this);
                });
                return;
            }
            stateTransition(this, common_1.STATE_CONNECTED);
            this.emit(Topology.OPEN, this);
            this.emit(Topology.CONNECT, this);
            if (typeof callback === 'function')
                callback(undefined, this);
        });
    }
    /** Close this topology */
    close(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (typeof options === 'boolean') {
            options = { force: options };
        }
        options = options !== null && options !== void 0 ? options : {};
        if (this.s.state === common_1.STATE_CLOSED || this.s.state === common_1.STATE_CLOSING) {
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
        stateTransition(this, common_1.STATE_CLOSING);
        drainWaitQueue(this[kWaitQueue], new error_1.MongoTopologyClosedError());
        (0, common_1.drainTimerQueue)(this.s.connectionTimers);
        if (this.s.srvPoller) {
            this.s.srvPoller.stop();
            this.s.srvPoller.removeListener(srv_polling_1.SrvPoller.SRV_RECORD_DISCOVERY, this.s.detectSrvRecords);
        }
        this.removeListener(Topology.TOPOLOGY_DESCRIPTION_CHANGED, this.s.detectShardedTopology);
        (0, utils_1.eachAsync)(Array.from(this.s.sessions.values()), (session, cb) => session.endSession(cb), () => {
            this.s.sessionPool.endAllPooledSessions(() => {
                (0, utils_1.eachAsync)(Array.from(this.s.servers.values()), (server, cb) => destroyServer(server, this, options, cb), err => {
                    this.s.servers.clear();
                    // emit an event for close
                    this.emit(Topology.TOPOLOGY_CLOSED, new events_1.TopologyClosedEvent(this.s.id));
                    stateTransition(this, common_1.STATE_CLOSED);
                    if (typeof callback === 'function') {
                        callback(err);
                    }
                });
            });
        });
    }
    /**
     * Selects a server according to the selection predicate provided
     *
     * @param selector - An optional selector to select servers by, defaults to a random selection within a latency window
     * @param options - Optional settings related to server selection
     * @param callback - The callback used to indicate success or failure
     * @returns An instance of a `Server` meeting the criteria of the predicate provided
     */
    selectServer(selector, options, callback) {
        let serverSelector;
        if (typeof selector !== 'function') {
            if (typeof selector === 'string') {
                serverSelector = (0, server_selection_1.readPreferenceServerSelector)(read_preference_1.ReadPreference.fromString(selector));
            }
            else {
                let readPreference;
                if (selector instanceof read_preference_1.ReadPreference) {
                    readPreference = selector;
                }
                else {
                    read_preference_1.ReadPreference.translate(options);
                    readPreference = options.readPreference || read_preference_1.ReadPreference.primary;
                }
                serverSelector = (0, server_selection_1.readPreferenceServerSelector)(readPreference);
            }
        }
        else {
            serverSelector = selector;
        }
        options = Object.assign({}, { serverSelectionTimeoutMS: this.s.serverSelectionTimeoutMS }, options);
        const isSharded = this.description.type === common_1.TopologyType.Sharded;
        const session = options.session;
        const transaction = session && session.transaction;
        if (isSharded && transaction && transaction.server) {
            callback(undefined, transaction.server);
            return;
        }
        const waitQueueMember = {
            serverSelector,
            transaction,
            callback
        };
        const serverSelectionTimeoutMS = options.serverSelectionTimeoutMS;
        if (serverSelectionTimeoutMS) {
            waitQueueMember.timer = setTimeout(() => {
                waitQueueMember[kCancelled] = true;
                waitQueueMember.timer = undefined;
                const timeoutError = new error_1.MongoServerSelectionError(`Server selection timed out after ${serverSelectionTimeoutMS} ms`, this.description);
                waitQueueMember.callback(timeoutError);
            }, serverSelectionTimeoutMS);
        }
        this[kWaitQueue].push(waitQueueMember);
        processWaitQueue(this);
    }
    // Sessions related methods
    /**
     * @returns Whether the topology should initiate selection to determine session support
     */
    shouldCheckForSessionSupport() {
        if (this.description.type === common_1.TopologyType.Single) {
            return !this.description.hasKnownServers;
        }
        return !this.description.hasDataBearingServers;
    }
    /**
     * @returns Whether sessions are supported on the current topology
     */
    hasSessionSupport() {
        return this.loadBalanced || this.description.logicalSessionTimeoutMinutes != null;
    }
    /** Start a logical session */
    startSession(options, clientOptions) {
        const session = new sessions_1.ClientSession(this, this.s.sessionPool, options, clientOptions);
        session.once('ended', () => {
            this.s.sessions.delete(session);
        });
        this.s.sessions.add(session);
        return session;
    }
    /** Send endSessions command(s) with the given session ids */
    endSessions(sessions, callback) {
        if (!Array.isArray(sessions)) {
            sessions = [sessions];
        }
        this.selectServer((0, server_selection_1.readPreferenceServerSelector)(read_preference_1.ReadPreference.primaryPreferred), {}, (err, server) => {
            if (err || !server) {
                if (typeof callback === 'function')
                    callback(err);
                return;
            }
            server.command((0, utils_1.ns)('admin.$cmd'), { endSessions: sessions }, { noResponse: true }, (err, result) => {
                if (typeof callback === 'function')
                    callback(err, result);
            });
        });
    }
    /**
     * Update the internal TopologyDescription with a ServerDescription
     *
     * @param serverDescription - The server to update in the internal list of server descriptions
     */
    serverUpdateHandler(serverDescription) {
        if (!this.s.description.hasServer(serverDescription.address)) {
            return;
        }
        // ignore this server update if its from an outdated topologyVersion
        if (isStaleServerDescription(this.s.description, serverDescription)) {
            return;
        }
        // these will be used for monitoring events later
        const previousTopologyDescription = this.s.description;
        const previousServerDescription = this.s.description.servers.get(serverDescription.address);
        if (!previousServerDescription) {
            return;
        }
        // Driver Sessions Spec: "Whenever a driver receives a cluster time from
        // a server it MUST compare it to the current highest seen cluster time
        // for the deployment. If the new cluster time is higher than the
        // highest seen cluster time it MUST become the new highest seen cluster
        // time. Two cluster times are compared using only the BsonTimestamp
        // value of the clusterTime embedded field."
        const clusterTime = serverDescription.$clusterTime;
        if (clusterTime) {
            (0, common_1._advanceClusterTime)(this, clusterTime);
        }
        // If we already know all the information contained in this updated description, then
        // we don't need to emit SDAM events, but still need to update the description, in order
        // to keep client-tracked attributes like last update time and round trip time up to date
        const equalDescriptions = previousServerDescription && previousServerDescription.equals(serverDescription);
        // first update the TopologyDescription
        this.s.description = this.s.description.update(serverDescription);
        if (this.s.description.compatibilityError) {
            this.emit(Topology.ERROR, new error_1.MongoCompatibilityError(this.s.description.compatibilityError));
            return;
        }
        // emit monitoring events for this change
        if (!equalDescriptions) {
            const newDescription = this.s.description.servers.get(serverDescription.address);
            if (newDescription) {
                this.emit(Topology.SERVER_DESCRIPTION_CHANGED, new events_1.ServerDescriptionChangedEvent(this.s.id, serverDescription.address, previousServerDescription, newDescription));
            }
        }
        // update server list from updated descriptions
        updateServers(this, serverDescription);
        // attempt to resolve any outstanding server selection attempts
        if (this[kWaitQueue].length > 0) {
            processWaitQueue(this);
        }
        if (!equalDescriptions) {
            this.emit(Topology.TOPOLOGY_DESCRIPTION_CHANGED, new events_1.TopologyDescriptionChangedEvent(this.s.id, previousTopologyDescription, this.s.description));
        }
    }
    auth(credentials, callback) {
        if (typeof credentials === 'function')
            (callback = credentials), (credentials = undefined);
        if (typeof callback === 'function')
            callback(undefined, true);
    }
    get clientMetadata() {
        return this.s.options.metadata;
    }
    isConnected() {
        return this.s.state === common_1.STATE_CONNECTED;
    }
    isDestroyed() {
        return this.s.state === common_1.STATE_CLOSED;
    }
    /**
     * @deprecated This function is deprecated and will be removed in the next major version.
     */
    unref() {
        (0, utils_1.emitWarning)('`unref` is a noop and will be removed in the next major version');
    }
    // NOTE: There are many places in code where we explicitly check the last hello
    //       to do feature support detection. This should be done any other way, but for
    //       now we will just return the first hello seen, which should suffice.
    lastHello() {
        const serverDescriptions = Array.from(this.description.servers.values());
        if (serverDescriptions.length === 0)
            return {};
        const sd = serverDescriptions.filter((sd) => sd.type !== common_1.ServerType.Unknown)[0];
        const result = sd || { maxWireVersion: this.description.commonWireVersion };
        return result;
    }
    get commonWireVersion() {
        return this.description.commonWireVersion;
    }
    get logicalSessionTimeoutMinutes() {
        return this.description.logicalSessionTimeoutMinutes;
    }
    get clusterTime() {
        return this.s.clusterTime;
    }
    set clusterTime(clusterTime) {
        this.s.clusterTime = clusterTime;
    }
}
exports.Topology = Topology;
/** @event */
Topology.SERVER_OPENING = constants_1.SERVER_OPENING;
/** @event */
Topology.SERVER_CLOSED = constants_1.SERVER_CLOSED;
/** @event */
Topology.SERVER_DESCRIPTION_CHANGED = constants_1.SERVER_DESCRIPTION_CHANGED;
/** @event */
Topology.TOPOLOGY_OPENING = constants_1.TOPOLOGY_OPENING;
/** @event */
Topology.TOPOLOGY_CLOSED = constants_1.TOPOLOGY_CLOSED;
/** @event */
Topology.TOPOLOGY_DESCRIPTION_CHANGED = constants_1.TOPOLOGY_DESCRIPTION_CHANGED;
/** @event */
Topology.ERROR = constants_1.ERROR;
/** @event */
Topology.OPEN = constants_1.OPEN;
/** @event */
Topology.CONNECT = constants_1.CONNECT;
/** @event */
Topology.CLOSE = constants_1.CLOSE;
/** @event */
Topology.TIMEOUT = constants_1.TIMEOUT;
/** Destroys a server, and removes all event listeners from the instance */
function destroyServer(server, topology, options, callback) {
    options = options !== null && options !== void 0 ? options : {};
    for (const event of constants_1.LOCAL_SERVER_EVENTS) {
        server.removeAllListeners(event);
    }
    server.destroy(options, () => {
        topology.emit(Topology.SERVER_CLOSED, new events_1.ServerClosedEvent(topology.s.id, server.description.address));
        for (const event of constants_1.SERVER_RELAY_EVENTS) {
            server.removeAllListeners(event);
        }
        if (typeof callback === 'function') {
            callback();
        }
    });
}
/** Predicts the TopologyType from options */
function topologyTypeFromOptions(options) {
    if (options === null || options === void 0 ? void 0 : options.directConnection) {
        return common_1.TopologyType.Single;
    }
    if (options === null || options === void 0 ? void 0 : options.replicaSet) {
        return common_1.TopologyType.ReplicaSetNoPrimary;
    }
    if (options === null || options === void 0 ? void 0 : options.loadBalanced) {
        return common_1.TopologyType.LoadBalanced;
    }
    return common_1.TopologyType.Unknown;
}
function randomSelection(array) {
    return array[Math.floor(Math.random() * array.length)];
}
/**
 * Creates new server instances and attempts to connect them
 *
 * @param topology - The topology that this server belongs to
 * @param serverDescription - The description for the server to initialize and connect to
 */
function createAndConnectServer(topology, serverDescription) {
    topology.emit(Topology.SERVER_OPENING, new events_1.ServerOpeningEvent(topology.s.id, serverDescription.address));
    const server = new server_1.Server(topology, serverDescription, topology.s.options);
    for (const event of constants_1.SERVER_RELAY_EVENTS) {
        server.on(event, (e) => topology.emit(event, e));
    }
    server.on(server_1.Server.DESCRIPTION_RECEIVED, description => topology.serverUpdateHandler(description));
    server.connect();
    return server;
}
/**
 * @param topology - Topology to update.
 * @param incomingServerDescription - New server description.
 */
function updateServers(topology, incomingServerDescription) {
    // update the internal server's description
    if (incomingServerDescription && topology.s.servers.has(incomingServerDescription.address)) {
        const server = topology.s.servers.get(incomingServerDescription.address);
        if (server) {
            server.s.description = incomingServerDescription;
        }
    }
    // add new servers for all descriptions we currently don't know about locally
    for (const serverDescription of topology.description.servers.values()) {
        if (!topology.s.servers.has(serverDescription.address)) {
            const server = createAndConnectServer(topology, serverDescription);
            topology.s.servers.set(serverDescription.address, server);
        }
    }
    // for all servers no longer known, remove their descriptions and destroy their instances
    for (const entry of topology.s.servers) {
        const serverAddress = entry[0];
        if (topology.description.hasServer(serverAddress)) {
            continue;
        }
        if (!topology.s.servers.has(serverAddress)) {
            continue;
        }
        const server = topology.s.servers.get(serverAddress);
        topology.s.servers.delete(serverAddress);
        // prepare server for garbage collection
        if (server) {
            destroyServer(server, topology);
        }
    }
}
function drainWaitQueue(queue, err) {
    while (queue.length) {
        const waitQueueMember = queue.shift();
        if (!waitQueueMember) {
            continue;
        }
        if (waitQueueMember.timer) {
            clearTimeout(waitQueueMember.timer);
        }
        if (!waitQueueMember[kCancelled]) {
            waitQueueMember.callback(err);
        }
    }
}
function processWaitQueue(topology) {
    if (topology.s.state === common_1.STATE_CLOSED) {
        drainWaitQueue(topology[kWaitQueue], new error_1.MongoTopologyClosedError());
        return;
    }
    const isSharded = topology.description.type === common_1.TopologyType.Sharded;
    const serverDescriptions = Array.from(topology.description.servers.values());
    const membersToProcess = topology[kWaitQueue].length;
    for (let i = 0; i < membersToProcess; ++i) {
        const waitQueueMember = topology[kWaitQueue].shift();
        if (!waitQueueMember) {
            continue;
        }
        if (waitQueueMember[kCancelled]) {
            continue;
        }
        let selectedDescriptions;
        try {
            const serverSelector = waitQueueMember.serverSelector;
            selectedDescriptions = serverSelector
                ? serverSelector(topology.description, serverDescriptions)
                : serverDescriptions;
        }
        catch (e) {
            if (waitQueueMember.timer) {
                clearTimeout(waitQueueMember.timer);
            }
            waitQueueMember.callback(e);
            continue;
        }
        if (selectedDescriptions.length === 0) {
            topology[kWaitQueue].push(waitQueueMember);
            continue;
        }
        const selectedServerDescription = randomSelection(selectedDescriptions);
        const selectedServer = topology.s.servers.get(selectedServerDescription.address);
        const transaction = waitQueueMember.transaction;
        if (isSharded && transaction && transaction.isActive && selectedServer) {
            transaction.pinServer(selectedServer);
        }
        if (waitQueueMember.timer) {
            clearTimeout(waitQueueMember.timer);
        }
        waitQueueMember.callback(undefined, selectedServer);
    }
    if (topology[kWaitQueue].length > 0) {
        // ensure all server monitors attempt monitoring soon
        for (const [, server] of topology.s.servers) {
            process.nextTick(function scheduleServerCheck() {
                return server.requestCheck();
            });
        }
    }
}
function isStaleServerDescription(topologyDescription, incomingServerDescription) {
    const currentServerDescription = topologyDescription.servers.get(incomingServerDescription.address);
    const currentTopologyVersion = currentServerDescription === null || currentServerDescription === void 0 ? void 0 : currentServerDescription.topologyVersion;
    return ((0, server_description_1.compareTopologyVersion)(currentTopologyVersion, incomingServerDescription.topologyVersion) > 0);
}
/** @public */
class ServerCapabilities {
    constructor(hello) {
        this.minWireVersion = hello.minWireVersion || 0;
        this.maxWireVersion = hello.maxWireVersion || 0;
    }
    get hasAggregationCursor() {
        return this.maxWireVersion >= 1;
    }
    get hasWriteCommands() {
        return this.maxWireVersion >= 2;
    }
    get hasTextSearch() {
        return this.minWireVersion >= 0;
    }
    get hasAuthCommands() {
        return this.maxWireVersion >= 1;
    }
    get hasListCollectionsCommand() {
        return this.maxWireVersion >= 3;
    }
    get hasListIndexesCommand() {
        return this.maxWireVersion >= 3;
    }
    get supportsSnapshotReads() {
        return this.maxWireVersion >= 13;
    }
    get commandsTakeWriteConcern() {
        return this.maxWireVersion >= 5;
    }
    get commandsTakeCollation() {
        return this.maxWireVersion >= 5;
    }
}
exports.ServerCapabilities = ServerCapabilities;
//# sourceMappingURL=topology.js.map