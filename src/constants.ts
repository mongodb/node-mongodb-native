export const SYSTEM_NAMESPACE_COLLECTION = 'system.namespaces';
export const SYSTEM_INDEX_COLLECTION = 'system.indexes';
export const SYSTEM_PROFILE_COLLECTION = 'system.profile';
export const SYSTEM_USER_COLLECTION = 'system.users';
export const SYSTEM_COMMAND_COLLECTION = '$cmd';
export const SYSTEM_JS_COLLECTION = 'system.js';

// events
export const ERROR = 'error' as const;
export const TIMEOUT = 'timeout' as const;
export const CLOSE = 'close' as const;
export const OPEN = 'open' as const;
export const CONNECT = 'connect' as const;
export const CLOSED = 'closed' as const;
export const ENDED = 'ended' as const;
export const MESSAGE = 'message' as const;
export const PINNED = 'pinned' as const;
export const UNPINNED = 'unpinned' as const;
export const DESCRIPTION_RECEIVED = 'descriptionReceived';
export const SERVER_OPENING = 'serverOpening' as const;
export const SERVER_CLOSED = 'serverClosed' as const;
export const SERVER_DESCRIPTION_CHANGED = 'serverDescriptionChanged' as const;
export const TOPOLOGY_OPENING = 'topologyOpening' as const;
export const TOPOLOGY_CLOSED = 'topologyClosed' as const;
export const TOPOLOGY_DESCRIPTION_CHANGED = 'topologyDescriptionChanged' as const;
export const CONNECTION_POOL_CREATED = 'connectionPoolCreated' as const;
export const CONNECTION_POOL_CLOSED = 'connectionPoolClosed' as const;
export const CONNECTION_POOL_CLEARED = 'connectionPoolCleared' as const;
export const CONNECTION_CREATED = 'connectionCreated' as const;
export const CONNECTION_READY = 'connectionReady' as const;
export const CONNECTION_CLOSED = 'connectionClosed' as const;
export const CONNECTION_CHECK_OUT_STARTED = 'connectionCheckOutStarted' as const;
export const CONNECTION_CHECK_OUT_FAILED = 'connectionCheckOutFailed' as const;
export const CONNECTION_CHECKED_OUT = 'connectionCheckedOut' as const;
export const CONNECTION_CHECKED_IN = 'connectionCheckedIn' as const;
export const CLUSTER_TIME_RECEIVED = 'clusterTimeReceived' as const;
export const COMMAND_STARTED = 'commandStarted' as const;
export const COMMAND_SUCCEEDED = 'commandSucceeded' as const;
export const COMMAND_FAILED = 'commandFailed' as const;
export const SERVER_HEARTBEAT_STARTED = 'serverHeartbeatStarted' as const;
export const SERVER_HEARTBEAT_SUCCEEDED = 'serverHeartbeatSucceeded' as const;
export const SERVER_HEARTBEAT_FAILED = 'serverHeartbeatFailed' as const;

/** @public */
export const HEARTBEAT_EVENTS = Object.freeze([
  SERVER_HEARTBEAT_STARTED,
  SERVER_HEARTBEAT_SUCCEEDED,
  SERVER_HEARTBEAT_FAILED
] as const);

/** @public */
export const CMAP_EVENTS = Object.freeze([
  CONNECTION_POOL_CREATED,
  CONNECTION_POOL_CLOSED,
  CONNECTION_CREATED,
  CONNECTION_READY,
  CONNECTION_CLOSED,
  CONNECTION_CHECK_OUT_STARTED,
  CONNECTION_CHECK_OUT_FAILED,
  CONNECTION_CHECKED_OUT,
  CONNECTION_CHECKED_IN,
  CONNECTION_POOL_CLEARED
] as const);

/** @public */
export const TOPOLOGY_EVENTS = Object.freeze([
  SERVER_OPENING,
  SERVER_CLOSED,
  SERVER_DESCRIPTION_CHANGED,
  TOPOLOGY_OPENING,
  TOPOLOGY_CLOSED,
  TOPOLOGY_DESCRIPTION_CHANGED,
  ERROR,
  TIMEOUT,
  CLOSE
] as const);

/** @public */
export const APM_EVENTS = Object.freeze([
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  COMMAND_FAILED
] as const);

/**
 * All events that we relay to the `Topology`
 * @internal
 */
export const SERVER_RELAY_EVENTS = Object.freeze([
  SERVER_HEARTBEAT_STARTED,
  SERVER_HEARTBEAT_SUCCEEDED,
  SERVER_HEARTBEAT_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  COMMAND_FAILED,
  ...CMAP_EVENTS
] as const);

/**
 * All events we listen to from `Server` instances, but do not forward to the client
 * @internal
 */
export const LOCAL_SERVER_EVENTS = Object.freeze([
  CONNECT,
  DESCRIPTION_RECEIVED,
  CLOSED,
  ENDED
] as const);

/** @public */
export const MONGO_CLIENT_EVENTS = Object.freeze([
  ...CMAP_EVENTS,
  ...APM_EVENTS,
  ...TOPOLOGY_EVENTS,
  ...HEARTBEAT_EVENTS
] as const);

/**
 * @internal
 * The legacy hello command that was deprecated in MongoDB 5.0.
 */
export const LEGACY_HELLO_COMMAND = 'ismaster';

/**
 * @internal
 * The legacy hello command that was deprecated in MongoDB 5.0.
 */
export const LEGACY_HELLO_COMMAND_CAMEL_CASE = 'isMaster';
