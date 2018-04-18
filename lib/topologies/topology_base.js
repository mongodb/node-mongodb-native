'use strict';

const EventEmitter = require('events'),
  MongoError = require('mongodb-core').MongoError,
  f = require('util').format,
  os = require('os'),
  translateReadPreference = require('../utils').translateReadPreference,
  ClientSession = require('mongodb-core').Sessions.ClientSession;

// The store of ops
var Store = function(topology, storeOptions) {
  var self = this;
  var storedOps = [];
  storeOptions = storeOptions || { force: false, bufferMaxEntries: -1 };

  // Internal state
  this.s = {
    storedOps: storedOps,
    storeOptions: storeOptions,
    topology: topology
  };

  Object.defineProperty(this, 'length', {
    enumerable: true,
    get: function() {
      return self.s.storedOps.length;
    }
  });
};

Store.prototype.add = function(opType, ns, ops, options, callback) {
  if (this.s.storeOptions.force) {
    return callback(MongoError.create({ message: 'db closed by application', driver: true }));
  }

  if (this.s.storeOptions.bufferMaxEntries === 0) {
    return callback(
      MongoError.create({
        message: f(
          'no connection available for operation and number of stored operation > %s',
          this.s.storeOptions.bufferMaxEntries
        ),
        driver: true
      })
    );
  }

  if (
    this.s.storeOptions.bufferMaxEntries > 0 &&
    this.s.storedOps.length > this.s.storeOptions.bufferMaxEntries
  ) {
    while (this.s.storedOps.length > 0) {
      var op = this.s.storedOps.shift();
      op.c(
        MongoError.create({
          message: f(
            'no connection available for operation and number of stored operation > %s',
            this.s.storeOptions.bufferMaxEntries
          ),
          driver: true
        })
      );
    }

    return;
  }

  this.s.storedOps.push({ t: opType, n: ns, o: ops, op: options, c: callback });
};

Store.prototype.addObjectAndMethod = function(opType, object, method, params, callback) {
  if (this.s.storeOptions.force) {
    return callback(MongoError.create({ message: 'db closed by application', driver: true }));
  }

  if (this.s.storeOptions.bufferMaxEntries === 0) {
    return callback(
      MongoError.create({
        message: f(
          'no connection available for operation and number of stored operation > %s',
          this.s.storeOptions.bufferMaxEntries
        ),
        driver: true
      })
    );
  }

  if (
    this.s.storeOptions.bufferMaxEntries > 0 &&
    this.s.storedOps.length > this.s.storeOptions.bufferMaxEntries
  ) {
    while (this.s.storedOps.length > 0) {
      var op = this.s.storedOps.shift();
      op.c(
        MongoError.create({
          message: f(
            'no connection available for operation and number of stored operation > %s',
            this.s.storeOptions.bufferMaxEntries
          ),
          driver: true
        })
      );
    }

    return;
  }

  this.s.storedOps.push({ t: opType, m: method, o: object, p: params, c: callback });
};

Store.prototype.flush = function(err) {
  while (this.s.storedOps.length > 0) {
    this.s.storedOps
      .shift()
      .c(
        err ||
          MongoError.create({ message: f('no connection available for operation'), driver: true })
      );
  }
};

var primaryOptions = ['primary', 'primaryPreferred', 'nearest', 'secondaryPreferred'];
var secondaryOptions = ['secondary', 'secondaryPreferred'];

Store.prototype.execute = function(options) {
  options = options || {};
  // Get current ops
  var ops = this.s.storedOps;
  // Reset the ops
  this.s.storedOps = [];

  // Unpack options
  var executePrimary = typeof options.executePrimary === 'boolean' ? options.executePrimary : true;
  var executeSecondary =
    typeof options.executeSecondary === 'boolean' ? options.executeSecondary : true;

  // Execute all the stored ops
  while (ops.length > 0) {
    var op = ops.shift();

    if (op.t === 'cursor') {
      if (executePrimary && executeSecondary) {
        op.o[op.m].apply(op.o, op.p);
      } else if (
        executePrimary &&
        op.o.options &&
        op.o.options.readPreference &&
        primaryOptions.indexOf(op.o.options.readPreference.mode) !== -1
      ) {
        op.o[op.m].apply(op.o, op.p);
      } else if (
        !executePrimary &&
        executeSecondary &&
        op.o.options &&
        op.o.options.readPreference &&
        secondaryOptions.indexOf(op.o.options.readPreference.mode) !== -1
      ) {
        op.o[op.m].apply(op.o, op.p);
      }
    } else if (op.t === 'auth') {
      this.s.topology[op.t].apply(this.s.topology, op.o);
    } else {
      if (executePrimary && executeSecondary) {
        this.s.topology[op.t](op.n, op.o, op.op, op.c);
      } else if (
        executePrimary &&
        op.op &&
        op.op.readPreference &&
        primaryOptions.indexOf(op.op.readPreference.mode) !== -1
      ) {
        this.s.topology[op.t](op.n, op.o, op.op, op.c);
      } else if (
        !executePrimary &&
        executeSecondary &&
        op.op &&
        op.op.readPreference &&
        secondaryOptions.indexOf(op.op.readPreference.mode) !== -1
      ) {
        this.s.topology[op.t](op.n, op.o, op.op, op.c);
      }
    }
  }
};

Store.prototype.all = function() {
  return this.s.storedOps;
};

// Server capabilities
var ServerCapabilities = function(ismaster) {
  var setup_get_property = function(object, name, value) {
    Object.defineProperty(object, name, {
      enumerable: true,
      get: function() {
        return value;
      }
    });
  };

  // Capabilities
  var aggregationCursor = false;
  var writeCommands = false;
  var textSearch = false;
  var authCommands = false;
  var listCollections = false;
  var listIndexes = false;
  var maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;
  var commandsTakeWriteConcern = false;
  var commandsTakeCollation = false;

  if (ismaster.minWireVersion >= 0) {
    textSearch = true;
  }

  if (ismaster.maxWireVersion >= 1) {
    aggregationCursor = true;
    authCommands = true;
  }

  if (ismaster.maxWireVersion >= 2) {
    writeCommands = true;
  }

  if (ismaster.maxWireVersion >= 3) {
    listCollections = true;
    listIndexes = true;
  }

  if (ismaster.maxWireVersion >= 5) {
    commandsTakeWriteConcern = true;
    commandsTakeCollation = true;
  }

  // If no min or max wire version set to 0
  if (ismaster.minWireVersion == null) {
    ismaster.minWireVersion = 0;
  }

  if (ismaster.maxWireVersion == null) {
    ismaster.maxWireVersion = 0;
  }

  // Map up read only parameters
  setup_get_property(this, 'hasAggregationCursor', aggregationCursor);
  setup_get_property(this, 'hasWriteCommands', writeCommands);
  setup_get_property(this, 'hasTextSearch', textSearch);
  setup_get_property(this, 'hasAuthCommands', authCommands);
  setup_get_property(this, 'hasListCollectionsCommand', listCollections);
  setup_get_property(this, 'hasListIndexesCommand', listIndexes);
  setup_get_property(this, 'minWireVersion', ismaster.minWireVersion);
  setup_get_property(this, 'maxWireVersion', ismaster.maxWireVersion);
  setup_get_property(this, 'maxNumberOfDocsInBatch', maxNumberOfDocsInBatch);
  setup_get_property(this, 'commandsTakeWriteConcern', commandsTakeWriteConcern);
  setup_get_property(this, 'commandsTakeCollation', commandsTakeCollation);
};

// Get package.json variable
const driverVersion = require('../../package.json').version,
  nodejsversion = f('Node.js %s, %s', process.version, os.endianness()),
  type = os.type(),
  name = process.platform,
  architecture = process.arch,
  release = os.release();

class TopologyBase extends EventEmitter {
  constructor() {
    super();

    // Build default client information
    this.clientInfo = {
      driver: {
        name: 'nodejs',
        version: driverVersion
      },
      os: {
        type: type,
        name: name,
        architecture: architecture,
        version: release
      },
      platform: nodejsversion
    };

    this.setMaxListeners(Infinity);
  }

  // Sessions related methods
  hasSessionSupport() {
    return this.logicalSessionTimeoutMinutes != null;
  }

  startSession(options, clientOptions) {
    const session = new ClientSession(this, this.s.sessionPool, options, clientOptions);
    session.once('ended', () => {
      this.s.sessions = this.s.sessions.filter(s => !s.equals(session));
    });

    this.s.sessions.push(session);
    return session;
  }

  endSessions(sessions, callback) {
    return this.s.coreTopology.endSessions(sessions, callback);
  }

  // Server capabilities
  capabilities() {
    if (this.s.sCapabilities) return this.s.sCapabilities;
    if (this.s.coreTopology.lastIsMaster() == null) return null;
    this.s.sCapabilities = new ServerCapabilities(this.s.coreTopology.lastIsMaster());
    return this.s.sCapabilities;
  }

  // Command
  command(ns, cmd, options, callback) {
    this.s.coreTopology.command(ns, cmd, translateReadPreference(options), callback);
  }

  // Insert
  insert(ns, ops, options, callback) {
    this.s.coreTopology.insert(ns, ops, options, callback);
  }

  // Update
  update(ns, ops, options, callback) {
    this.s.coreTopology.update(ns, ops, options, callback);
  }

  // Remove
  remove(ns, ops, options, callback) {
    this.s.coreTopology.remove(ns, ops, options, callback);
  }

  // IsConnected
  isConnected(options) {
    options = options || {};
    options = translateReadPreference(options);

    return this.s.coreTopology.isConnected(options);
  }

  // IsDestroyed
  isDestroyed() {
    return this.s.coreTopology.isDestroyed();
  }

  // Cursor
  cursor(ns, cmd, options) {
    options = options || {};
    options = translateReadPreference(options);
    options.disconnectHandler = this.s.store;
    options.topology = this;

    return this.s.coreTopology.cursor(ns, cmd, options);
  }

  lastIsMaster() {
    return this.s.coreTopology.lastIsMaster();
  }

  getServer(options) {
    return this.s.coreTopology.getServer(options);
  }

  getConnection(options) {
    return this.s.coreTopology.getConnection(options);
  }

  /**
   * Unref all sockets
   * @method
   */
  unref() {
    return this.s.coreTopology.unref();
  }

  auth() {
    var args = Array.prototype.slice.call(arguments, 0);
    this.s.coreTopology.auth.apply(this.s.coreTopology, args);
  }

  logout() {
    var args = Array.prototype.slice.call(arguments, 0);
    this.s.coreTopology.logout.apply(this.s.coreTopology, args);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  connections() {
    return this.s.coreTopology.connections();
  }

  close(forceClosed) {
    // If we have sessions, we want to individually move them to the session pool,
    // and then send a single endSessions call.
    if (this.s.sessions.length) {
      this.s.sessions.forEach(session => session.endSession());
    }

    if (this.s.sessionPool) {
      this.s.sessionPool.endAllPooledSessions();
    }

    this.s.coreTopology.destroy({
      force: typeof forceClosed === 'boolean' ? forceClosed : false
    });

    // We need to wash out all stored processes
    if (forceClosed === true) {
      this.s.storeOptions.force = forceClosed;
      this.s.store.flush();
    }
  }
}

// Properties
Object.defineProperty(TopologyBase.prototype, 'isMasterDoc', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.lastIsMaster();
  }
});

Object.defineProperty(TopologyBase.prototype, 'bson', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.s.bson;
  }
});

Object.defineProperty(TopologyBase.prototype, 'parserType', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.parserType;
  }
});

Object.defineProperty(TopologyBase.prototype, 'logicalSessionTimeoutMinutes', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.logicalSessionTimeoutMinutes;
  }
});

Object.defineProperty(TopologyBase.prototype, 'type', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.type;
  }
});

exports.Store = Store;
exports.ServerCapabilities = ServerCapabilities;
exports.TopologyBase = TopologyBase;
