"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOPOLOGY_EVENTS = exports.CMAP_EVENTS = exports.HEARTBEAT_EVENTS = exports.RESUME_TOKEN_CHANGED = exports.END = exports.CHANGE = exports.INIT = exports.MORE = exports.RESPONSE = exports.SERVER_HEARTBEAT_FAILED = exports.SERVER_HEARTBEAT_SUCCEEDED = exports.SERVER_HEARTBEAT_STARTED = exports.COMMAND_FAILED = exports.COMMAND_SUCCEEDED = exports.COMMAND_STARTED = exports.CLUSTER_TIME_RECEIVED = exports.CONNECTION_CHECKED_IN = exports.CONNECTION_CHECKED_OUT = exports.CONNECTION_CHECK_OUT_FAILED = exports.CONNECTION_CHECK_OUT_STARTED = exports.CONNECTION_CLOSED = exports.CONNECTION_READY = exports.CONNECTION_CREATED = exports.CONNECTION_POOL_READY = exports.CONNECTION_POOL_CLEARED = exports.CONNECTION_POOL_CLOSED = exports.CONNECTION_POOL_CREATED = exports.TOPOLOGY_DESCRIPTION_CHANGED = exports.TOPOLOGY_CLOSED = exports.TOPOLOGY_OPENING = exports.SERVER_DESCRIPTION_CHANGED = exports.SERVER_CLOSED = exports.SERVER_OPENING = exports.DESCRIPTION_RECEIVED = exports.UNPINNED = exports.PINNED = exports.MESSAGE = exports.ENDED = exports.CLOSED = exports.CONNECT = exports.OPEN = exports.CLOSE = exports.TIMEOUT = exports.ERROR = exports.SYSTEM_JS_COLLECTION = exports.SYSTEM_COMMAND_COLLECTION = exports.SYSTEM_USER_COLLECTION = exports.SYSTEM_PROFILE_COLLECTION = exports.SYSTEM_INDEX_COLLECTION = exports.SYSTEM_NAMESPACE_COLLECTION = void 0;
exports.LEGACY_HELLO_COMMAND_CAMEL_CASE = exports.LEGACY_HELLO_COMMAND = exports.MONGO_CLIENT_EVENTS = exports.LOCAL_SERVER_EVENTS = exports.SERVER_RELAY_EVENTS = exports.APM_EVENTS = void 0;
exports.SYSTEM_NAMESPACE_COLLECTION = 'system.namespaces';
exports.SYSTEM_INDEX_COLLECTION = 'system.indexes';
exports.SYSTEM_PROFILE_COLLECTION = 'system.profile';
exports.SYSTEM_USER_COLLECTION = 'system.users';
exports.SYSTEM_COMMAND_COLLECTION = '$cmd';
exports.SYSTEM_JS_COLLECTION = 'system.js';
// events
exports.ERROR = 'error';
exports.TIMEOUT = 'timeout';
exports.CLOSE = 'close';
exports.OPEN = 'open';
exports.CONNECT = 'connect';
exports.CLOSED = 'closed';
exports.ENDED = 'ended';
exports.MESSAGE = 'message';
exports.PINNED = 'pinned';
exports.UNPINNED = 'unpinned';
exports.DESCRIPTION_RECEIVED = 'descriptionReceived';
exports.SERVER_OPENING = 'serverOpening';
exports.SERVER_CLOSED = 'serverClosed';
exports.SERVER_DESCRIPTION_CHANGED = 'serverDescriptionChanged';
exports.TOPOLOGY_OPENING = 'topologyOpening';
exports.TOPOLOGY_CLOSED = 'topologyClosed';
exports.TOPOLOGY_DESCRIPTION_CHANGED = 'topologyDescriptionChanged';
exports.CONNECTION_POOL_CREATED = 'connectionPoolCreated';
exports.CONNECTION_POOL_CLOSED = 'connectionPoolClosed';
exports.CONNECTION_POOL_CLEARED = 'connectionPoolCleared';
exports.CONNECTION_POOL_READY = 'connectionPoolReady';
exports.CONNECTION_CREATED = 'connectionCreated';
exports.CONNECTION_READY = 'connectionReady';
exports.CONNECTION_CLOSED = 'connectionClosed';
exports.CONNECTION_CHECK_OUT_STARTED = 'connectionCheckOutStarted';
exports.CONNECTION_CHECK_OUT_FAILED = 'connectionCheckOutFailed';
exports.CONNECTION_CHECKED_OUT = 'connectionCheckedOut';
exports.CONNECTION_CHECKED_IN = 'connectionCheckedIn';
exports.CLUSTER_TIME_RECEIVED = 'clusterTimeReceived';
exports.COMMAND_STARTED = 'commandStarted';
exports.COMMAND_SUCCEEDED = 'commandSucceeded';
exports.COMMAND_FAILED = 'commandFailed';
exports.SERVER_HEARTBEAT_STARTED = 'serverHeartbeatStarted';
exports.SERVER_HEARTBEAT_SUCCEEDED = 'serverHeartbeatSucceeded';
exports.SERVER_HEARTBEAT_FAILED = 'serverHeartbeatFailed';
exports.RESPONSE = 'response';
exports.MORE = 'more';
exports.INIT = 'init';
exports.CHANGE = 'change';
exports.END = 'end';
exports.RESUME_TOKEN_CHANGED = 'resumeTokenChanged';
/** @public */
exports.HEARTBEAT_EVENTS = Object.freeze([
    exports.SERVER_HEARTBEAT_STARTED,
    exports.SERVER_HEARTBEAT_SUCCEEDED,
    exports.SERVER_HEARTBEAT_FAILED
]);
/** @public */
exports.CMAP_EVENTS = Object.freeze([
    exports.CONNECTION_POOL_CREATED,
    exports.CONNECTION_POOL_READY,
    exports.CONNECTION_POOL_CLEARED,
    exports.CONNECTION_POOL_CLOSED,
    exports.CONNECTION_CREATED,
    exports.CONNECTION_READY,
    exports.CONNECTION_CLOSED,
    exports.CONNECTION_CHECK_OUT_STARTED,
    exports.CONNECTION_CHECK_OUT_FAILED,
    exports.CONNECTION_CHECKED_OUT,
    exports.CONNECTION_CHECKED_IN
]);
/** @public */
exports.TOPOLOGY_EVENTS = Object.freeze([
    exports.SERVER_OPENING,
    exports.SERVER_CLOSED,
    exports.SERVER_DESCRIPTION_CHANGED,
    exports.TOPOLOGY_OPENING,
    exports.TOPOLOGY_CLOSED,
    exports.TOPOLOGY_DESCRIPTION_CHANGED,
    exports.ERROR,
    exports.TIMEOUT,
    exports.CLOSE
]);
/** @public */
exports.APM_EVENTS = Object.freeze([
    exports.COMMAND_STARTED,
    exports.COMMAND_SUCCEEDED,
    exports.COMMAND_FAILED
]);
/**
 * All events that we relay to the `Topology`
 * @internal
 */
exports.SERVER_RELAY_EVENTS = Object.freeze([
    exports.SERVER_HEARTBEAT_STARTED,
    exports.SERVER_HEARTBEAT_SUCCEEDED,
    exports.SERVER_HEARTBEAT_FAILED,
    exports.COMMAND_STARTED,
    exports.COMMAND_SUCCEEDED,
    exports.COMMAND_FAILED,
    ...exports.CMAP_EVENTS
]);
/**
 * All events we listen to from `Server` instances, but do not forward to the client
 * @internal
 */
exports.LOCAL_SERVER_EVENTS = Object.freeze([
    exports.CONNECT,
    exports.DESCRIPTION_RECEIVED,
    exports.CLOSED,
    exports.ENDED
]);
/** @public */
exports.MONGO_CLIENT_EVENTS = Object.freeze([
    ...exports.CMAP_EVENTS,
    ...exports.APM_EVENTS,
    ...exports.TOPOLOGY_EVENTS,
    ...exports.HEARTBEAT_EVENTS
]);
/**
 * @internal
 * The legacy hello command that was deprecated in MongoDB 5.0.
 */
exports.LEGACY_HELLO_COMMAND = 'ismaster';
/**
 * @internal
 * The legacy hello command that was deprecated in MongoDB 5.0.
 */
exports.LEGACY_HELLO_COMMAND_CAMEL_CASE = 'isMaster';
//# sourceMappingURL=constants.js.map