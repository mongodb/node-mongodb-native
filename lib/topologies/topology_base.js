'use strict';

const { EventEmitter } = require('events');
const { MongoError } = require('../error');
const { format: f } = require('util');
const ReadPreference = require('../read_preference');
const { ClientSession } = require('../sessions');

// The store of ops
class Store {
  constructor(topology, storeOptions) {
    var self = this;
    var storedOps = [];
    storeOptions = storeOptions || { force: false, bufferMaxEntries: -1 };

    // Internal state
    this.s = {
      storedOps,
      storeOptions,
      topology
    };

    Object.defineProperty(this, 'length', {
      enumerable: true,
      get() {
        return self.s.storedOps.length;
      }
    });
  }

  add(opType, ns, ops, options, callback) {
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
  }

  addObjectAndMethod(opType, object, method, params, callback) {
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
  }

  flush(err) {
    while (this.s.storedOps.length > 0) {
      this.s.storedOps
        .shift()
        .c(
          err ||
            MongoError.create({ message: f('no connection available for operation'), driver: true })
        );
    }
  }

  execute(options) {
    options = options || {};
    // Get current ops
    var ops = this.s.storedOps;
    // Reset the ops
    this.s.storedOps = [];

    // Unpack options
    var executePrimary =
      typeof options.executePrimary === 'boolean' ? options.executePrimary : true;
    var executeSecondary =
      typeof options.executeSecondary === 'boolean' ? options.executeSecondary : true;

    // Execute all the stored ops
    while (ops.length > 0) {
      var op = ops.shift();

      if (op.t === 'cursor') {
        if (executePrimary && executeSecondary) {
          op.o[op.m](...op.p);
        } else if (
          executePrimary &&
          op.o.options &&
          op.o.options.readPreference &&
          primaryOptions.indexOf(op.o.options.readPreference.mode) !== -1
        ) {
          op.o[op.m](...op.p);
        } else if (
          !executePrimary &&
          executeSecondary &&
          op.o.options &&
          op.o.options.readPreference &&
          secondaryOptions.indexOf(op.o.options.readPreference.mode) !== -1
        ) {
          op.o[op.m](...op.p);
        }
      } else if (op.t === 'auth') {
        this.s.topology[op.t](...op.o);
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
  }

  all() {
    return this.s.storedOps;
  }
}

const primaryOptions = ['primary', 'primaryPreferred', 'nearest', 'secondaryPreferred'];
const secondaryOptions = ['secondary', 'secondaryPreferred'];

// Server capabilities
class ServerCapabilities {
  constructor(ismaster) {
    // Capabilities
    let aggregationCursor = false;
    let writeCommands = false;
    let textSearch = false;
    let authCommands = false;
    let listCollections = false;
    let listIndexes = false;
    let maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;
    let commandsTakeWriteConcern = false;
    let commandsTakeCollation = false;

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

    function setup_get_property(object, name, value) {
      Object.defineProperty(object, name, {
        enumerable: true,
        get() {
          return value;
        }
      });
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
  }
}

class TopologyBase extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(Infinity);
  }

  // Sessions related methods
  hasSessionSupport() {
    return this.logicalSessionTimeoutMinutes != null;
  }

  startSession(options, clientOptions) {
    const session = new ClientSession(this, this.s.sessionPool, options, clientOptions);

    session.once('ended', () => {
      this.s.sessions.delete(session);
    });

    this.s.sessions.add(session);
    return session;
  }

  endSessions(sessions, callback) {
    return this.s.coreTopology.endSessions(sessions, callback);
  }

  get clientMetadata() {
    return this.s.coreTopology.s.options.metadata;
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
    this.s.coreTopology.command(ns.toString(), cmd, ReadPreference.translate(options), callback);
  }

  // Insert
  insert(ns, ops, options, callback) {
    this.s.coreTopology.insert(ns.toString(), ops, options, callback);
  }

  // Update
  update(ns, ops, options, callback) {
    this.s.coreTopology.update(ns.toString(), ops, options, callback);
  }

  // Remove
  remove(ns, ops, options, callback) {
    this.s.coreTopology.remove(ns.toString(), ops, options, callback);
  }

  // IsConnected
  isConnected(options) {
    options = options || {};
    options = ReadPreference.translate(options);

    return this.s.coreTopology.isConnected(options);
  }

  // IsDestroyed
  isDestroyed() {
    return this.s.coreTopology.isDestroyed();
  }

  // Cursor
  cursor(ns, cmd, options) {
    options = options || {};
    options = ReadPreference.translate(options);
    options.disconnectHandler = this.s.store;
    options.topology = this;

    return this.s.coreTopology.cursor(ns, cmd, options);
  }

  lastIsMaster() {
    return this.s.coreTopology.lastIsMaster();
  }

  selectServer(selector, options, callback) {
    return this.s.coreTopology.selectServer(selector, options, callback);
  }

  /**
   * Unref all sockets
   *
   * @function
   */
  unref() {
    return this.s.coreTopology.unref();
  }

  /**
   * All raw connections
   *
   * @function
   * @returns {any[]}
   */
  connections() {
    return this.s.coreTopology.connections();
  }

  close(forceClosed, callback) {
    // If we have sessions, we want to individually move them to the session pool,
    // and then send a single endSessions call.
    this.s.sessions.forEach(session => session.endSession());

    if (this.s.sessionPool) {
      this.s.sessionPool.endAllPooledSessions();
    }

    // We need to wash out all stored processes
    if (forceClosed === true) {
      this.s.storeOptions.force = forceClosed;
      this.s.store.flush();
    }

    this.s.coreTopology.destroy(
      {
        force: typeof forceClosed === 'boolean' ? forceClosed : false
      },
      callback
    );
  }
}

Object.defineProperty(TopologyBase.prototype, 'logicalSessionTimeoutMinutes', {
  enumerable: true,
  get() {
    return this.s.coreTopology.logicalSessionTimeoutMinutes;
  }
});

Object.defineProperty(TopologyBase.prototype, 'type', {
  enumerable: true,
  get() {
    return this.s.coreTopology.type;
  }
});

module.exports = {
  Store,
  ServerCapabilities,
  TopologyBase
};
