'use strict';
const EventEmitter = require('events');
const ServerDescription = require('./server_description').ServerDescription;
const ServerType = require('./server_description').ServerType;
const TopologyDescription = require('./topology_description').TopologyDescription;
const TopologyType = require('./topology_description').TopologyType;
const monitoring = require('./monitoring');
const calculateDurationInMs = require('../utils').calculateDurationInMs;
const MongoTimeoutError = require('../error').MongoTimeoutError;
const Server = require('./server');
const relayEvents = require('../utils').relayEvents;
const ReadPreference = require('../topologies/read_preference');
const readPreferenceServerSelector = require('./server_selectors').readPreferenceServerSelector;
const writableServerSelector = require('./server_selectors').writableServerSelector;
const isRetryableWritesSupported = require('../topologies/shared').isRetryableWritesSupported;
const Cursor = require('../cursor');
const deprecate = require('util').deprecate;
const BSON = require('../connection/utils').retrieveBSON();
const createCompressionInfo = require('../topologies/shared').createCompressionInfo;
const isRetryableError = require('../error').isRetryableError;
const MongoParseError = require('../error').MongoParseError;
const ClientSession = require('../sessions').ClientSession;
const createClientInfo = require('../topologies/shared').createClientInfo;
const MongoError = require('../error').MongoError;
const resolveClusterTime = require('../topologies/shared').resolveClusterTime;

// Global state
let globalTopologyCounter = 0;

// Constants
const TOPOLOGY_DEFAULTS = {
  localThresholdMS: 15,
  serverSelectionTimeoutMS: 10000,
  heartbeatFrequencyMS: 30000,
  minHeartbeatFrequencyMS: 500
};

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
];

// all events we listen to from `Server` instances
const LOCAL_SERVER_EVENTS = SERVER_RELAY_EVENTS.concat([
  'error',
  'connect',
  'descriptionReceived',
  'close',
  'ended'
]);

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

    options = Object.assign({}, TOPOLOGY_DEFAULTS, options);

    const topologyType = topologyTypeFromSeedlist(seedlist, options);
    const topologyId = globalTopologyCounter++;
    const serverDescriptions = seedlist.reduce((result, seed) => {
      if (seed.domain_socket) seed.host = seed.domain_socket;
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result.set(address, new ServerDescription(address));
      return result;
    }, new Map());

    this.s = {
      // the id of this topology
      id: topologyId,
      // passed in options
      options,
      // initial seedlist of servers to connect to
      seedlist: seedlist,
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
      minHeartbeatIntervalMS: options.minHeartbeatIntervalMS,
      // allow users to override the cursor factory
      Cursor: options.cursorFactory || Cursor,
      // the bson parser
      bson: options.bson || new BSON(),
      // a map of server instances to normalized addresses
      servers: new Map(),
      // Server Session Pool
      sessionPool: null,
      // Active client sessions
      sessions: [],
      // Promise library
      promiseLibrary: options.promiseLibrary || Promise,
      credentials: options.credentials,
      clusterTime: null
    };

    // amend options for server instance creation
    this.s.options.compression = { compressors: createCompressionInfo(options) };

    // add client info
    this.s.clientInfo = createClientInfo(options);
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
   * All raw connections
   * @method
   * @return {Connection[]}
   */
  connections() {
    return Array.from(this.s.servers.values()).reduce((result, server) => {
      return result.concat(server.s.pool.allConnections());
    }, []);
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

    // emit SDAM monitoring events
    this.emit('topologyOpening', new monitoring.TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    connectServers(this, Array.from(this.s.description.servers.values()));
    this.s.connected = true;

    // otherwise, wait for a server to properly connect based on user provided read preference,
    // or primary.

    translateReadPreference(options);
    const readPreference = options.readPreference || ReadPreference.primary;

    this.selectServer(readPreferenceServerSelector(readPreference), options, (err, server) => {
      if (err) {
        if (typeof callback === 'function') {
          callback(err, null);
        } else {
          this.emit('error', err);
        }

        return;
      }

      const errorHandler = err => {
        server.removeListener('connect', connectHandler);
        if (typeof callback === 'function') callback(err, null);
      };

      const connectHandler = (_, err) => {
        server.removeListener('error', errorHandler);
        this.emit('open', err, this);
        this.emit('connect', this);

        if (typeof callback === 'function') callback(err, this);
      };

      const STATE_CONNECTING = 1;
      if (server.s.state === STATE_CONNECTING) {
        server.once('error', errorHandler);
        server.once('connect', connectHandler);
        return;
      }

      connectHandler();
    });
  }

  /**
   * Close this topology
   */
  close(options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (this.s.sessionPool) {
      this.s.sessions.forEach(session => session.endSession());
      this.s.sessionPool.endAllPooledSessions();
    }

    const servers = this.s.servers;
    if (servers.size === 0) {
      this.s.connected = false;
      if (typeof callback === 'function') {
        callback(null, null);
      }

      return;
    }

    // destroy all child servers
    let destroyed = 0;
    servers.forEach(server =>
      destroyServer(server, this, () => {
        destroyed++;
        if (destroyed === servers.size) {
          // emit an event for close
          this.emit('topologyClosed', new monitoring.TopologyClosedEvent(this.s.id));

          this.s.connected = false;
          if (typeof callback === 'function') {
            callback(null, null);
          }
        }
      })
    );
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

        translateReadPreference(options);
        const readPreference = options.readPreference || ReadPreference.primary;
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
      callback(null, transaction.server);
      return;
    }

    selectServers(
      this,
      selector,
      options.serverSelectionTimeoutMS,
      process.hrtime(),
      (err, servers) => {
        if (err) return callback(err, null);

        const selectedServer = randomSelection(servers);
        if (isSharded && transaction && transaction.isActive) {
          transaction.pinServer(selectedServer);
        }

        callback(null, selectedServer);
      }
    );
  }

  // Sessions related methods
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
      this.s.sessions = this.s.sessions.filter(s => !s.equals(session));
    });

    this.s.sessions.push(session);
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

    // these will be used for monitoring events later
    const previousTopologyDescription = this.s.description;
    const previousServerDescription = this.s.description.servers.get(serverDescription.address);

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
    if (this.s.description.compatibilityError) {
      this.emit('error', new MongoError(this.s.description.compatibilityError));
      return;
    }

    // emit monitoring events for this change
    this.emit(
      'serverDescriptionChanged',
      new monitoring.ServerDescriptionChangedEvent(
        this.s.id,
        serverDescription.address,
        previousServerDescription,
        this.s.description.servers.get(serverDescription.address)
      )
    );

    // update server list from updated descriptions
    updateServers(this, serverDescription);

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

    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        previousTopologyDescription,
        this.s.description
      )
    );
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

    translateReadPreference(options);
    const readPreference = options.readPreference || ReadPreference.primary;

    this.selectServer(readPreferenceServerSelector(readPreference), options, (err, server) => {
      if (err) {
        callback(err, null);
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
        if (!isRetryableError(err)) {
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
    translateReadPreference(options);

    return new CursorClass(this.s.bson, ns, cmd, options, topology, this.s.options);
  }

  get clientInfo() {
    return this.s.clientInfo;
  }

  // Legacy methods for compat with old topology types
  isConnected() {
    // console.log('not implemented: `isConnected`');
    return true;
  }

  isDestroyed() {
    // console.log('not implemented: `isDestroyed`');
    return false;
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

/**
 * Destroys a server, and removes all event listeners from the instance
 *
 * @param {Server} server
 */
function destroyServer(server, topology, callback) {
  LOCAL_SERVER_EVENTS.forEach(event => server.removeAllListeners(event));

  server.destroy(() => {
    topology.emit(
      'serverClosed',
      new monitoring.ServerClosedEvent(topology.s.id, server.description.address)
    );

    if (typeof callback === 'function') callback(null, null);
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
  const replicaSet = options.replicaSet || options.setName || options.rs_name;
  if (seedlist.length === 1 && !replicaSet) return TopologyType.Single;
  if (replicaSet) return TopologyType.ReplicaSetNoPrimary;
  return TopologyType.Unknown;
}

function randomSelection(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Selects servers using the provided selector
 *
 * @private
 * @param {Topology} topology The topology to select servers from
 * @param {function} selector The actual predicate used for selecting servers
 * @param {Number} timeout The max time we are willing wait for selection
 * @param {Number} start A high precision timestamp for the start of the selection process
 * @param {function} callback The callback used to convey errors or the resultant servers
 */
function selectServers(topology, selector, timeout, start, callback) {
  const duration = calculateDurationInMs(start);
  if (duration >= timeout) {
    return callback(new MongoTimeoutError(`Server selection timed out after ${timeout} ms`));
  }

  // ensure we are connected
  if (!topology.s.connected) {
    topology.connect();

    // we want to make sure we're still within the requested timeout window
    const failToConnectTimer = setTimeout(() => {
      topology.removeListener('connect', connectHandler);
      callback(new MongoTimeoutError('Server selection timed out waiting to connect'));
    }, timeout - duration);

    const connectHandler = () => {
      clearTimeout(failToConnectTimer);
      selectServers(topology, selector, timeout, process.hrtime(), callback);
    };

    topology.once('connect', connectHandler);
    return;
  }

  // otherwise, attempt server selection
  const serverDescriptions = Array.from(topology.description.servers.values());
  let descriptions;

  // support server selection by options with readPreference
  if (typeof selector === 'object') {
    const readPreference = selector.readPreference
      ? selector.readPreference
      : ReadPreference.primary;

    selector = readPreferenceServerSelector(readPreference);
  }

  try {
    descriptions = selector
      ? selector(topology.description, serverDescriptions)
      : serverDescriptions;
  } catch (e) {
    return callback(e, null);
  }

  if (descriptions.length) {
    const servers = descriptions.map(description => topology.s.servers.get(description.address));
    return callback(null, servers);
  }

  const retrySelection = () => {
    // ensure all server monitors attempt monitoring soon
    topology.s.servers.forEach(server => {
      setTimeout(
        () => server.monitor({ heartbeatFrequencyMS: topology.description.heartbeatFrequencyMS }),
        TOPOLOGY_DEFAULTS.minHeartbeatFrequencyMS
      );
    });

    const descriptionChangedHandler = () => {
      // successful iteration, clear the check timer
      clearTimeout(iterationTimer);

      if (topology.description.error) {
        callback(topology.description.error, null);
        return;
      }

      // topology description has changed due to monitoring, reattempt server selection
      selectServers(topology, selector, timeout, start, callback);
    };

    const iterationTimer = setTimeout(() => {
      topology.removeListener('topologyDescriptionChanged', descriptionChangedHandler);
      callback(new MongoTimeoutError(`Server selection timed out after ${timeout} ms`));
    }, timeout - duration);

    topology.once('topologyDescriptionChanged', descriptionChangedHandler);
  };

  retrySelection();
}

function createAndConnectServer(topology, serverDescription) {
  topology.emit(
    'serverOpening',
    new monitoring.ServerOpeningEvent(topology.s.id, serverDescription.address)
  );

  const server = new Server(serverDescription, topology.s.options, topology);
  relayEvents(server, topology, SERVER_RELAY_EVENTS);

  server.once('connect', serverConnectEventHandler(server, topology));
  server.on('descriptionReceived', topology.serverUpdateHandler.bind(topology));
  server.on('error', serverErrorEventHandler(server, topology));
  server.on('close', () => topology.emit('close', server));
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
  if (topology.s.servers.has(incomingServerDescription.address)) {
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

function serverConnectEventHandler(server, topology) {
  return function(/* isMaster, err */) {
    server.monitor({
      initial: true,
      heartbeatFrequencyMS: topology.description.heartbeatFrequencyMS
    });
  };
}

function serverErrorEventHandler(server, topology) {
  return function(err) {
    topology.emit(
      'serverClosed',
      new monitoring.ServerClosedEvent(topology.s.id, server.description.address)
    );

    if (err instanceof MongoParseError) {
      resetServerState(server, err, { clearPool: true });
      return;
    }

    resetServerState(server, err);
  };
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
      if (!isRetryableError(err)) {
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

/**
 * Resets the internal state of this server to `Unknown` by simulating an empty ismaster
 *
 * @private
 * @param {Server} server
 * @param {MongoError} error The error that caused the state reset
 * @param {object} [options] Optional settings
 * @param {boolean} [options.clearPool=false] Pool should be cleared out on state reset
 */
function resetServerState(server, error, options) {
  options = Object.assign({}, { clearPool: false }, options);

  function resetState() {
    server.emit(
      'descriptionReceived',
      new ServerDescription(server.description.address, null, { error })
    );
  }

  if (options.clearPool && server.pool) {
    server.pool.reset(() => resetState());
    return;
  }

  resetState();
}

function translateReadPreference(options) {
  if (options.readPreference == null) {
    return;
  }

  let r = options.readPreference;
  if (typeof r === 'string') {
    options.readPreference = new ReadPreference(r);
  } else if (r && !(r instanceof ReadPreference) && typeof r === 'object') {
    const mode = r.mode || r.preference;
    if (mode && typeof mode === 'string') {
      options.readPreference = new ReadPreference(mode, r.tags, {
        maxStalenessSeconds: r.maxStalenessSeconds
      });
    }
  } else if (!(r instanceof ReadPreference)) {
    throw new TypeError('Invalid read preference: ' + r);
  }

  return options;
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

module.exports = Topology;
