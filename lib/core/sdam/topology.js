'use strict';
const Denque = require('denque');
const EventEmitter = require('events');
const ServerDescription = require('./server_description').ServerDescription;
const ServerType = require('./common').ServerType;
const TopologyDescription = require('./topology_description').TopologyDescription;
const TopologyType = require('./common').TopologyType;
const events = require('./events');
const Server = require('./server').Server;
const relayEvents = require('../utils').relayEvents;
const ReadPreference = require('../topologies/read_preference');
const isRetryableWritesSupported = require('../topologies/shared').isRetryableWritesSupported;
const CoreCursor = require('../cursor').CoreCursor;
const deprecate = require('util').deprecate;
const BSON = require('../connection/utils').retrieveBSON();
const createCompressionInfo = require('../topologies/shared').createCompressionInfo;
const ClientSession = require('../sessions').ClientSession;
const MongoError = require('../error').MongoError;
const MongoServerSelectionError = require('../error').MongoServerSelectionError;
const resolveClusterTime = require('../topologies/shared').resolveClusterTime;
const SrvPoller = require('./srv_polling').SrvPoller;
const getMMAPError = require('../topologies/shared').getMMAPError;
const makeStateMachine = require('../utils').makeStateMachine;
const eachAsync = require('../utils').eachAsync;
const emitDeprecationWarning = require('../../utils').emitDeprecationWarning;
const ServerSessionPool = require('../sessions').ServerSessionPool;
const makeClientMetadata = require('../utils').makeClientMetadata;
const CMAP_EVENT_NAMES = require('../../cmap/events').CMAP_EVENT_NAMES;
const compareTopologyVersion = require('./server_description').compareTopologyVersion;

const common = require('./common');
const drainTimerQueue = common.drainTimerQueue;
const clearAndRemoveTimerFrom = common.clearAndRemoveTimerFrom;

const serverSelection = require('./server_selection');
const readPreferenceServerSelector = serverSelection.readPreferenceServerSelector;
const writableServerSelector = serverSelection.writableServerSelector;

// Global state
let globalTopologyCounter = 0;

// events that we relay to the `Topology`
const SERVER_RELAY_EVENTS = [
  'serverHeartbeatStarted',
  'serverHeartbeatSucceeded',
  'serverHeartbeatFailed',
  'commandStarted',
  'commandSucceeded',
  'commandFailed',

  // NOTE: Legacy events
  'monitoring'
].concat(CMAP_EVENT_NAMES);

// all events we listen to from `Server` instances
const LOCAL_SERVER_EVENTS = ['connect', 'descriptionReceived', 'close', 'ended'];

const STATE_CLOSING = common.STATE_CLOSING;
const STATE_CLOSED = common.STATE_CLOSED;
const STATE_CONNECTING = common.STATE_CONNECTING;
const STATE_CONNECTED = common.STATE_CONNECTED;
const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

const DEPRECATED_OPTIONS = new Set([
  'autoReconnect',
  'reconnectTries',
  'reconnectInterval',
  'bufferMaxEntries'
]);

const kCancelled = Symbol('cancelled');
const kWaitQueue = Symbol('waitQueue');

/**
 * A container of server instances representing a connection to a MongoDB topology.
 *
 * @fires Topology#serverOpening
 * @fires Topology#serverClosed
 * @fires Topology#serverDescriptionChanged
 * @fires Topology#topologyOpening
 * @fires Topology#topologyClosed
 * @fires Topology#topologyDescriptionChanged
 * @fires Topology#serverHeartbeatStarted
 * @fires Topology#serverHeartbeatSucceeded
 * @fires Topology#serverHeartbeatFailed
 */
class Topology extends EventEmitter {
  /**
   * Create a topology
   *
   * @param {Array|String} [seedlist] a string list, or array of Server instances to connect to
   * @param {Object} [options] Optional settings
   * @param {Number} [options.localThresholdMS=15] The size of the latency window for selecting among multiple suitable servers
   * @param {Number} [options.serverSelectionTimeoutMS=30000] How long to block for server selection before throwing an error
   * @param {Number} [options.heartbeatFrequencyMS=10000] The frequency with which topology updates are scheduled
   */
  constructor(seedlist, options) {
    super();
    if (typeof options === 'undefined' && typeof seedlist !== 'string') {
      options = seedlist;
      seedlist = [];

      // this is for legacy single server constructor support
      if (options.host) {
        seedlist.push({ host: options.host, port: options.port });
      }
    }

    seedlist = seedlist || [];
    if (typeof seedlist === 'string') {
      seedlist = parseStringSeedlist(seedlist);
    }

    options = Object.assign({}, common.TOPOLOGY_DEFAULTS, options);
    options = Object.freeze(
      Object.assign(options, {
        metadata: makeClientMetadata(options),
        compression: { compressors: createCompressionInfo(options) }
      })
    );

    DEPRECATED_OPTIONS.forEach(optionName => {
      if (options[optionName]) {
        emitDeprecationWarning(
          `The option \`${optionName}\` is incompatible with the unified topology, please read more by visiting http://bit.ly/2D8WfT6`,
          'DeprecationWarning'
        );
      }
    });

    const topologyType = topologyTypeFromSeedlist(seedlist, options);
    const topologyId = globalTopologyCounter++;
    const serverDescriptions = seedlist.reduce((result, seed) => {
      if (seed.domain_socket) seed.host = seed.domain_socket;
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result.set(address, new ServerDescription(address));
      return result;
    }, new Map());

    this[kWaitQueue] = new Denque();
    this.s = {
      // the id of this topology
      id: topologyId,
      // passed in options
      options,
      // initial seedlist of servers to connect to
      seedlist: seedlist,
      // initial state
      state: STATE_CLOSED,
      // the topology description
      description: new TopologyDescription(
        topologyType,
        serverDescriptions,
        options.replicaSet,
        null,
        null,
        null,
        options
      ),
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
      heartbeatFrequencyMS: options.heartbeatFrequencyMS,
      minHeartbeatFrequencyMS: options.minHeartbeatFrequencyMS,
      // allow users to override the cursor factory
      Cursor: options.cursorFactory || CoreCursor,
      // the bson parser
      bson:
        options.bson ||
        new BSON([
          BSON.Binary,
          BSON.Code,
          BSON.DBRef,
          BSON.Decimal128,
          BSON.Double,
          BSON.Int32,
          BSON.Long,
          BSON.Map,
          BSON.MaxKey,
          BSON.MinKey,
          BSON.ObjectId,
          BSON.BSONRegExp,
          BSON.Symbol,
          BSON.Timestamp
        ]),
      // a map of server instances to normalized addresses
      servers: new Map(),
      // Server Session Pool
      sessionPool: new ServerSessionPool(this),
      // Active client sessions
      sessions: new Set(),
      // Promise library
      promiseLibrary: options.promiseLibrary || Promise,
      credentials: options.credentials,
      clusterTime: null,

      // timer management
      connectionTimers: new Set()
    };

    if (options.srvHost) {
      this.s.srvPoller =
        options.srvPoller ||
        new SrvPoller({
          heartbeatFrequencyMS: this.s.heartbeatFrequencyMS,
          srvHost: options.srvHost, // TODO: GET THIS
          logger: options.logger,
          loggerLevel: options.loggerLevel
        });
      this.s.detectTopologyDescriptionChange = ev => {
        const previousType = ev.previousDescription.type;
        const newType = ev.newDescription.type;

        if (previousType !== TopologyType.Sharded && newType === TopologyType.Sharded) {
          this.s.handleSrvPolling = srvPollingHandler(this);
          this.s.srvPoller.on('srvRecordDiscovery', this.s.handleSrvPolling);
          this.s.srvPoller.start();
        }
      };

      this.on('topologyDescriptionChanged', this.s.detectTopologyDescriptionChange);
    }

    // NOTE: remove this when NODE-1709 is resolved
    this.setMaxListeners(Infinity);
  }

  /**
   * @return A `TopologyDescription` for this topology
   */
  get description() {
    return this.s.description;
  }

  get parserType() {
    return BSON.native ? 'c++' : 'js';
  }

  /**
   * Initiate server connect
   *
   * @param {Object} [options] Optional settings
   * @param {Array} [options.auth=null] Array of auth options to apply on connect
   * @param {function} [callback] An optional callback called once on the first connected server
   */
  connect(options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    if (this.s.state === STATE_CONNECTED) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CONNECTING);

    // emit SDAM monitoring events
    this.emit('topologyOpening', new events.TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      'topologyDescriptionChanged',
      new events.TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    // connect all known servers, then attempt server selection to connect
    connectServers(this, Array.from(this.s.description.servers.values()));

    ReadPreference.translate(options);
    const readPreference = options.readPreference || ReadPreference.primary;
    const connectHandler = err => {
      if (err) {
        this.close();

        if (typeof callback === 'function') {
          callback(err);
        } else {
          this.emit('error', err);
        }

        return;
      }

      stateTransition(this, STATE_CONNECTED);
      this.emit('open', err, this);
      this.emit('connect', this);

      if (typeof callback === 'function') callback(err, this);
    };

    // TODO: NODE-2471
    if (this.s.credentials) {
      this.command('admin.$cmd', { ping: 1 }, { readPreference }, connectHandler);
      return;
    }

    this.selectServer(readPreferenceServerSelector(readPreference), options, connectHandler);
  }

  /**
   * Close this topology
   */
  close(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (typeof options === 'boolean') {
      options = { force: options };
    }

    options = options || {};
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CLOSING);

    drainWaitQueue(this[kWaitQueue], new MongoError('Topology closed'));
    drainTimerQueue(this.s.connectionTimers);

    if (this.s.srvPoller) {
      this.s.srvPoller.stop();
      if (this.s.handleSrvPolling) {
        this.s.srvPoller.removeListener('srvRecordDiscovery', this.s.handleSrvPolling);
        delete this.s.handleSrvPolling;
      }
    }

    if (this.s.detectTopologyDescriptionChange) {
      this.removeListener('topologyDescriptionChanged', this.s.detectTopologyDescriptionChange);
      delete this.s.detectTopologyDescriptionChange;
    }

    this.s.sessions.forEach(session => session.endSession());
    this.s.sessionPool.endAllPooledSessions(() => {
      eachAsync(
        Array.from(this.s.servers.values()),
        (server, cb) => destroyServer(server, this, options, cb),
        err => {
          this.s.servers.clear();

          // emit an event for close
          this.emit('topologyClosed', new events.TopologyClosedEvent(this.s.id));

          stateTransition(this, STATE_CLOSED);
          this.emit('close');

          if (typeof callback === 'function') {
            callback(err);
          }
        }
      );
    });
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param {function} [selector] An optional selector to select servers by, defaults to a random selection within a latency window
   * @param {object} [options] Optional settings related to server selection
   * @param {number} [options.serverSelectionTimeoutMS] How long to block for server selection before throwing an error
   * @param {function} callback The callback used to indicate success or failure
   * @return {Server} An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(selector, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      if (typeof selector !== 'function') {
        options = selector;

        let readPreference;
        if (selector instanceof ReadPreference) {
          readPreference = selector;
        } else if (typeof selector === 'string') {
          readPreference = new ReadPreference(selector);
        } else {
          ReadPreference.translate(options);
          readPreference = options.readPreference || ReadPreference.primary;
        }

        selector = readPreferenceServerSelector(readPreference);
      } else {
        options = {};
      }
    }

    options = Object.assign(
      {},
      { serverSelectionTimeoutMS: this.s.serverSelectionTimeoutMS },
      options
    );

    const isSharded = this.description.type === TopologyType.Sharded;
    const session = options.session;
    const transaction = session && session.transaction;

    if (isSharded && transaction && transaction.server) {
      callback(undefined, transaction.server);
      return;
    }

    // support server selection by options with readPreference
    let serverSelector = selector;
    if (typeof selector === 'object') {
      const readPreference = selector.readPreference
        ? selector.readPreference
        : ReadPreference.primary;

      serverSelector = readPreferenceServerSelector(readPreference);
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
        const timeoutError = new MongoServerSelectionError(
          `Server selection timed out after ${serverSelectionTimeoutMS} ms`,
          this.description
        );

        waitQueueMember.callback(timeoutError);
      }, serverSelectionTimeoutMS);
    }

    this[kWaitQueue].push(waitQueueMember);
    processWaitQueue(this);
  }

  // Sessions related methods

  /**
   * @return Whether the topology should initiate selection to determine session support
   */
  shouldCheckForSessionSupport() {
    if (this.description.type === TopologyType.Single) {
      return !this.description.hasKnownServers;
    }

    return !this.description.hasDataBearingServers;
  }

  /**
   * @return Whether sessions are supported on the current topology
   */
  hasSessionSupport() {
    return this.description.logicalSessionTimeoutMinutes != null;
  }

  /**
   * Start a logical session
   */
  startSession(options, clientOptions) {
    const session = new ClientSession(this, this.s.sessionPool, options, clientOptions);
    session.once('ended', () => {
      this.s.sessions.delete(session);
    });

    this.s.sessions.add(session);
    return session;
  }

  /**
   * Send endSessions command(s) with the given session ids
   *
   * @param {Array} sessions The sessions to end
   * @param {function} [callback]
   */
  endSessions(sessions, callback) {
    if (!Array.isArray(sessions)) {
      sessions = [sessions];
    }

    this.command(
      'admin.$cmd',
      { endSessions: sessions },
      { readPreference: ReadPreference.primaryPreferred, noResponse: true },
      () => {
        // intentionally ignored, per spec
        if (typeof callback === 'function') callback();
      }
    );
  }

  /**
   * Update the internal TopologyDescription with a ServerDescription
   *
   * @param {object} serverDescription The server to update in the internal list of server descriptions
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

    // Driver Sessions Spec: "Whenever a driver receives a cluster time from
    // a server it MUST compare it to the current highest seen cluster time
    // for the deployment. If the new cluster time is higher than the
    // highest seen cluster time it MUST become the new highest seen cluster
    // time. Two cluster times are compared using only the BsonTimestamp
    // value of the clusterTime embedded field."
    const clusterTime = serverDescription.$clusterTime;
    if (clusterTime) {
      resolveClusterTime(this, clusterTime);
    }

    // If we already know all the information contained in this updated description, then
    // we don't need to emit SDAM events, but still need to update the description, in order
    // to keep client-tracked attributes like last update time and round trip time up to date
    const equalDescriptions =
      previousServerDescription && previousServerDescription.equals(serverDescription);

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
    if (this.s.description.compatibilityError) {
      this.emit('error', new MongoError(this.s.description.compatibilityError));
      return;
    }

    // emit monitoring events for this change
    if (!equalDescriptions) {
      this.emit(
        'serverDescriptionChanged',
        new events.ServerDescriptionChangedEvent(
          this.s.id,
          serverDescription.address,
          previousServerDescription,
          this.s.description.servers.get(serverDescription.address)
        )
      );
    }

    // update server list from updated descriptions
    updateServers(this, serverDescription);

    // attempt to resolve any outstanding server selection attempts
    if (this[kWaitQueue].length > 0) {
      processWaitQueue(this);
    }

    if (!equalDescriptions) {
      this.emit(
        'topologyDescriptionChanged',
        new events.TopologyDescriptionChangedEvent(
          this.s.id,
          previousTopologyDescription,
          this.s.description
        )
      );
    }
  }

  auth(credentials, callback) {
    if (typeof credentials === 'function') (callback = credentials), (credentials = null);
    if (typeof callback === 'function') callback(null, true);
  }

  logout(callback) {
    if (typeof callback === 'function') callback(null, true);
  }

  // Basic operation support. Eventually this should be moved into command construction
  // during the command refactor.

  /**
   * Insert one or more documents
   *
   * @param {String} ns The full qualified namespace for this operation
   * @param {Array} ops An array of documents to insert
   * @param {Boolean} [options.ordered=true] Execute in order or out of order
   * @param {Object} [options.writeConcern] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
   * @param {opResultCallback} callback A callback function
   */
  insert(ns, ops, options, callback) {
    executeWriteOperation({ topology: this, op: 'insert', ns, ops }, options, callback);
  }

  /**
   * Perform one or more update operations
   *
   * @param {string} ns The fully qualified namespace for this operation
   * @param {array} ops An array of updates
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields
   * @param {ClientSession} [options.session] Session to use for the operation
   * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
   * @param {opResultCallback} callback A callback function
   */
  update(ns, ops, options, callback) {
    executeWriteOperation({ topology: this, op: 'update', ns, ops }, options, callback);
  }

  /**
   * Perform one or more remove operations
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of removes
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
   * @param {opResultCallback} callback A callback function
   */
  remove(ns, ops, options, callback) {
    executeWriteOperation({ topology: this, op: 'remove', ns, ops }, options, callback);
  }

  /**
   * Execute a command
   *
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Connection} [options.connection] Specify connection object to execute command against
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  command(ns, cmd, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    ReadPreference.translate(options);
    const readPreference = options.readPreference || ReadPreference.primary;

    this.selectServer(readPreferenceServerSelector(readPreference), options, (err, server) => {
      if (err) {
        callback(err);
        return;
      }

      const willRetryWrite =
        !options.retrying &&
        !!options.retryWrites &&
        options.session &&
        isRetryableWritesSupported(this) &&
        !options.session.inTransaction() &&
        isWriteCommand(cmd);

      const cb = (err, result) => {
        if (!err) return callback(null, result);
        if (!shouldRetryOperation(err)) {
          return callback(err);
        }

        if (willRetryWrite) {
          const newOptions = Object.assign({}, options, { retrying: true });
          return this.command(ns, cmd, newOptions, callback);
        }

        return callback(err);
      };

      // increment and assign txnNumber
      if (willRetryWrite) {
        options.session.incrementTransactionNumber();
        options.willRetryWrite = willRetryWrite;
      }

      server.command(ns, cmd, options, cb);
    });
  }

  /**
   * Create a new cursor
   *
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object|Long} cmd Can be either a command returning a cursor or a cursorId
   * @param {object} [options] Options for the cursor
   * @param {object} [options.batchSize=0] Batchsize for the operation
   * @param {array} [options.documents=[]] Initial documents list for cursor
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {object} [options.topology] The internal topology of the created cursor
   * @returns {Cursor}
   */
  cursor(ns, cmd, options) {
    options = options || {};
    const topology = options.topology || this;
    const CursorClass = options.cursorFactory || this.s.Cursor;
    ReadPreference.translate(options);

    return new CursorClass(topology, ns, cmd, options);
  }

  get clientMetadata() {
    return this.s.options.metadata;
  }

  isConnected() {
    return this.s.state === STATE_CONNECTED;
  }

  isDestroyed() {
    return this.s.state === STATE_CLOSED;
  }

  unref() {
    console.log('not implemented: `unref`');
  }

  // NOTE: There are many places in code where we explicitly check the last isMaster
  //       to do feature support detection. This should be done any other way, but for
  //       now we will just return the first isMaster seen, which should suffice.
  lastIsMaster() {
    const serverDescriptions = Array.from(this.description.servers.values());
    if (serverDescriptions.length === 0) return {};

    const sd = serverDescriptions.filter(sd => sd.type !== ServerType.Unknown)[0];
    const result = sd || { maxWireVersion: this.description.commonWireVersion };
    return result;
  }

  get logicalSessionTimeoutMinutes() {
    return this.description.logicalSessionTimeoutMinutes;
  }

  get bson() {
    return this.s.bson;
  }
}

Object.defineProperty(Topology.prototype, 'clusterTime', {
  enumerable: true,
  get: function() {
    return this.s.clusterTime;
  },
  set: function(clusterTime) {
    this.s.clusterTime = clusterTime;
  }
});

// legacy aliases
Topology.prototype.destroy = deprecate(
  Topology.prototype.close,
  'destroy() is deprecated, please use close() instead'
);

const RETRYABLE_WRITE_OPERATIONS = ['findAndModify', 'insert', 'update', 'delete'];
function isWriteCommand(command) {
  return RETRYABLE_WRITE_OPERATIONS.some(op => command[op]);
}

function isStaleServerDescription(topologyDescription, incomingServerDescription) {
  const currentServerDescription = topologyDescription.servers.get(
    incomingServerDescription.address
  );
  const currentTopologyVersion = currentServerDescription.topologyVersion;
  return (
    compareTopologyVersion(currentTopologyVersion, incomingServerDescription.topologyVersion) > 0
  );
}

/**
 * Destroys a server, and removes all event listeners from the instance
 *
 * @param {Server} server
 */
function destroyServer(server, topology, options, callback) {
  options = options || {};
  LOCAL_SERVER_EVENTS.forEach(event => server.removeAllListeners(event));

  server.destroy(options, () => {
    topology.emit(
      'serverClosed',
      new events.ServerClosedEvent(topology.s.id, server.description.address)
    );

    SERVER_RELAY_EVENTS.forEach(event => server.removeAllListeners(event));
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/**
 * Parses a basic seedlist in string form
 *
 * @param {string} seedlist The seedlist to parse
 */
function parseStringSeedlist(seedlist) {
  return seedlist.split(',').map(seed => ({
    host: seed.split(':')[0],
    port: seed.split(':')[1] || 27017
  }));
}

function topologyTypeFromSeedlist(seedlist, options) {
  if (options.directConnection) {
    return TopologyType.Single;
  }

  const replicaSet = options.replicaSet || options.setName || options.rs_name;
  if (replicaSet == null) {
    return TopologyType.Unknown;
  }

  return TopologyType.ReplicaSetNoPrimary;
}

function randomSelection(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function createAndConnectServer(topology, serverDescription, connectDelay) {
  topology.emit(
    'serverOpening',
    new events.ServerOpeningEvent(topology.s.id, serverDescription.address)
  );

  const server = new Server(serverDescription, topology.s.options, topology);
  relayEvents(server, topology, SERVER_RELAY_EVENTS);

  server.on('descriptionReceived', topology.serverUpdateHandler.bind(topology));

  if (connectDelay) {
    const connectTimer = setTimeout(() => {
      clearAndRemoveTimerFrom(connectTimer, topology.s.connectionTimers);
      server.connect();
    }, connectDelay);

    topology.s.connectionTimers.add(connectTimer);
    return server;
  }

  server.connect();
  return server;
}

/**
 * Create `Server` instances for all initially known servers, connect them, and assign
 * them to the passed in `Topology`.
 *
 * @param {Topology} topology The topology responsible for the servers
 * @param {ServerDescription[]} serverDescriptions A list of server descriptions to connect
 */
function connectServers(topology, serverDescriptions) {
  topology.s.servers = serverDescriptions.reduce((servers, serverDescription) => {
    const server = createAndConnectServer(topology, serverDescription);
    servers.set(serverDescription.address, server);
    return servers;
  }, new Map());
}

function updateServers(topology, incomingServerDescription) {
  // update the internal server's description
  if (incomingServerDescription && topology.s.servers.has(incomingServerDescription.address)) {
    const server = topology.s.servers.get(incomingServerDescription.address);
    server.s.description = incomingServerDescription;
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

    const server = topology.s.servers.get(serverAddress);
    topology.s.servers.delete(serverAddress);

    // prepare server for garbage collection
    destroyServer(server, topology);
  }
}

function executeWriteOperation(args, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // TODO: once we drop Node 4, use destructuring either here or in arguments.
  const topology = args.topology;
  const op = args.op;
  const ns = args.ns;
  const ops = args.ops;

  const willRetryWrite =
    !args.retrying &&
    !!options.retryWrites &&
    options.session &&
    isRetryableWritesSupported(topology) &&
    !options.session.inTransaction();

  topology.selectServer(writableServerSelector(), options, (err, server) => {
    if (err) {
      callback(err, null);
      return;
    }

    const handler = (err, result) => {
      if (!err) return callback(null, result);
      if (!shouldRetryOperation(err)) {
        err = getMMAPError(err);
        return callback(err);
      }

      if (willRetryWrite) {
        const newArgs = Object.assign({}, args, { retrying: true });
        return executeWriteOperation(newArgs, options, callback);
      }

      return callback(err);
    };

    if (callback.operationId) {
      handler.operationId = callback.operationId;
    }

    // increment and assign txnNumber
    if (willRetryWrite) {
      options.session.incrementTransactionNumber();
      options.willRetryWrite = willRetryWrite;
    }

    // execute the write operation
    server[op](ns, ops, options, handler);
  });
}

function shouldRetryOperation(err) {
  return err instanceof MongoError && err.hasErrorLabel('RetryableWriteError');
}

function srvPollingHandler(topology) {
  return function handleSrvPolling(ev) {
    const previousTopologyDescription = topology.s.description;
    topology.s.description = topology.s.description.updateFromSrvPollingEvent(ev);
    if (topology.s.description === previousTopologyDescription) {
      // Nothing changed, so return
      return;
    }

    updateServers(topology);

    topology.emit(
      'topologyDescriptionChanged',
      new events.TopologyDescriptionChangedEvent(
        topology.s.id,
        previousTopologyDescription,
        topology.s.description
      )
    );
  };
}

function drainWaitQueue(queue, err) {
  while (queue.length) {
    const waitQueueMember = queue.shift();
    clearTimeout(waitQueueMember.timer);
    if (!waitQueueMember[kCancelled]) {
      waitQueueMember.callback(err);
    }
  }
}

function processWaitQueue(topology) {
  if (topology.s.state === STATE_CLOSED) {
    drainWaitQueue(topology[kWaitQueue], new MongoError('Topology is closed, please connect'));
    return;
  }

  const serverDescriptions = Array.from(topology.description.servers.values());
  const membersToProcess = topology[kWaitQueue].length;
  for (let i = 0; i < membersToProcess && topology[kWaitQueue].length; ++i) {
    const waitQueueMember = topology[kWaitQueue].shift();
    if (waitQueueMember[kCancelled]) {
      continue;
    }

    let selectedDescriptions;
    try {
      const serverSelector = waitQueueMember.serverSelector;
      selectedDescriptions = serverSelector
        ? serverSelector(topology.description, serverDescriptions)
        : serverDescriptions;
    } catch (e) {
      clearTimeout(waitQueueMember.timer);
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
    const isSharded = topology.description.type === TopologyType.Sharded;
    if (isSharded && transaction && transaction.isActive) {
      transaction.pinServer(selectedServer);
    }

    clearTimeout(waitQueueMember.timer);
    waitQueueMember.callback(undefined, selectedServer);
  }

  if (topology[kWaitQueue].length > 0) {
    // ensure all server monitors attempt monitoring soon
    topology.s.servers.forEach(server => process.nextTick(() => server.requestCheck()));
  }
}

/**
 * A server opening SDAM monitoring event
 *
 * @event Topology#serverOpening
 * @type {ServerOpeningEvent}
 */

/**
 * A server closed SDAM monitoring event
 *
 * @event Topology#serverClosed
 * @type {ServerClosedEvent}
 */

/**
 * A server description SDAM change monitoring event
 *
 * @event Topology#serverDescriptionChanged
 * @type {ServerDescriptionChangedEvent}
 */

/**
 * A topology open SDAM event
 *
 * @event Topology#topologyOpening
 * @type {TopologyOpeningEvent}
 */

/**
 * A topology closed SDAM event
 *
 * @event Topology#topologyClosed
 * @type {TopologyClosedEvent}
 */

/**
 * A topology structure SDAM change event
 *
 * @event Topology#topologyDescriptionChanged
 * @type {TopologyDescriptionChangedEvent}
 */

/**
 * A topology serverHeartbeatStarted SDAM event
 *
 * @event Topology#serverHeartbeatStarted
 * @type {ServerHeartbeatStartedEvent}
 */

/**
 * A topology serverHeartbeatFailed SDAM event
 *
 * @event Topology#serverHeartbeatFailed
 * @type {ServerHearbeatFailedEvent}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event Topology#serverHeartbeatSucceeded
 * @type {ServerHeartbeatSucceededEvent}
 */

/**
 * An event emitted indicating a command was started, if command monitoring is enabled
 *
 * @event Topology#commandStarted
 * @type {object}
 */

/**
 * An event emitted indicating a command succeeded, if command monitoring is enabled
 *
 * @event Topology#commandSucceeded
 * @type {object}
 */

/**
 * An event emitted indicating a command failed, if command monitoring is enabled
 *
 * @event Topology#commandFailed
 * @type {object}
 */

module.exports = {
  Topology
};
