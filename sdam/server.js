'use strict';
const EventEmitter = require('events');
const MongoError = require('../error').MongoError;
const Pool = require('../connection/pool');
const relayEvents = require('../utils').relayEvents;
const calculateDurationInMs = require('../utils').calculateDurationInMs;
const Query = require('../connection/commands').Query;
const TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support');
const ThreeTwoWireProtocolSupport = require('../wireprotocol/3_2_support');
const BSON = require('../connection/utils').retrieveBSON();
const createClientInfo = require('../topologies/shared').createClientInfo;
const Logger = require('../connection/logger');
const ServerDescription = require('./server_description').ServerDescription;
const ReadPreference = require('../topologies/read_preference');

/**
 *
 * @fires Server#serverHeartbeatStarted
 * @fires Server#serverHeartbeatSucceeded
 * @fires Server#serverHeartbeatFailed
 */
class Server extends EventEmitter {
  /**
   * Create a server
   *
   * @param {ServerDescription} description
   * @param {Object} options
   */
  constructor(description, options) {
    super();

    this.s = {
      // the server description
      description,
      // a saved copy of the incoming options
      options,
      // the server logger
      logger: Logger('Server', options),
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
      // client metadata for the initial handshake
      clientInfo: createClientInfo(options),
    };
  }

  get description() {
    return this.s.description;
  }

  get name() {
    return this.s.description.address;
  }

  /**
   * Initiate server connect
   *
   * @param {Array} [options.auth] Array of auth options to apply on connect
   */
  connect(options) {
    options = options || {};

    // do not allow connect to be called on anything that's not disconnected
    if (this.s.pool && !this.s.pool.isDisconnected() && !this.s.pool.isDestroyed()) {
      throw new MongoError(`Server instance in invalid state ${this.s.pool.state}`);
    }

    // create a pool
    this.s.pool = new Pool(this, Object.assign(this.s.options, options, { bson: this.s.bson }));

    // Set up listeners
    this.s.pool.on('connect', connectEventHandler(this));
    this.s.pool.on('close', closeEventHandler(this));

    // this.s.pool.on('error', errorEventHandler(this));
    // this.s.pool.on('timeout', timeoutEventHandler(this));
    // this.s.pool.on('parseError', errorEventHandler(this));
    // this.s.pool.on('reconnect', reconnectEventHandler(this));
    // this.s.pool.on('reconnectFailed', errorEventHandler(this));

    // relay all command monitoring events
    relayEvents(this.s.pool, this, ['commandStarted', 'commandSucceeded', 'commandFailed']);

    // If auth settings have been provided, use them
    if (options.auth) {
      this.s.pool.connect.apply(this.s.pool, options.auth);
      return;
    }

    this.s.pool.connect();
  }

  /**
   * Destroy the server connection
   *
   * @param {Boolean} [options.emitClose=false] Emit close event on destroy
   * @param {Boolean} [options.emitDestroy=false] Emit destroy event on destroy
   * @param {Boolean} [options.force=false] Force destroy the pool
   */
  destroy(callback) {
    if (typeof callback === 'function') {
      callback(null, null);
    }
  }

  /**
   * Execute a command
   *
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.checkKeys=false] Specify if the bson parser should validate keys.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {Boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  command(ns, cmd, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    const error = basicReadValidations(this, options);
    if (error) {
      return callback(error, null);
    }

    // Clone the options
    options = Object.assign({}, options, { wireProtocolCommand: false });

    // Debug log
    if (this.s.logger.isDebug()) {
      this.s.logger.debug(
        `executing command [${JSON.stringify({ ns, cmd, options })}] against ${this.name}`
      );
    }

    // Check if we have collation support
    if (this.description.maxWireVersion < 5 && cmd.collation) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    // Are we executing against a specific topology
    const topology = options.topology || {};
    // Create the query object
    const query = this.s.wireProtocolHandler.command(this.s.bson, ns, cmd, {}, topology, options);
    // Set slave OK of the query
    query.slaveOk = options.readPreference ? options.readPreference.slaveOk() : false;

    // write options
    const writeOptions = {
      raw: typeof options.raw === 'boolean' ? options.raw : false,
      promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
      promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
      promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
      command: true,
      monitoring: typeof options.monitoring === 'boolean' ? options.monitoring : false,
      fullResult: typeof options.fullResult === 'boolean' ? options.fullResult : false,
      requestId: query.requestId,
      socketTimeout: typeof options.socketTimeout === 'number' ? options.socketTimeout : null,
      session: options.session || null
    };

    // write the operation to the pool
    this.s.pool.write(query, writeOptions, callback);
  }

  /**
   * Insert one or more documents
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of documents to insert
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  insert(ns, ops, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    const error = basicWriteValidations(this, options);
    if (error) {
      callback(error);
      return;
    }

    // Check if we have collation support
    if (this.description.maxWireVersion < 5 && options.collation) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];

    // Execute write
    return this.s.wireProtocolHandler.insert(this.s.pool, ns, this.s.bson, ops, options, callback);
  }

  /**
   * Perform one or more update operations
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of updates
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  update(ns, ops, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    const error = basicWriteValidations(this, options);
    if (error) {
      callback(error, null);
      return;
    }

    // Check if we have collation support
    if (this.description.maxWireVersion < 5 && options.collation) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];

    // Execute write
    return this.s.wireProtocolHandler.update(this.s.pool, ns, this.s.bson, ops, options, callback);
  }

  /**
   * Perform one or more remove operations
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of removes
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  remove(ns, ops, options, callback) {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    const error = basicWriteValidations(this, options);
    if (error) {
      callback(error, null);
      return;
    }

    // Check if we have collation support
    if (this.description.maxWireVersion < 5 && options.collation) {
      callback(new MongoError(`server ${this.name} does not support collation`));
      return;
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];
    // Execute write
    return this.s.wireProtocolHandler.remove(this.s.pool, ns, this.s.bson, ops, options, callback);
  }
}

function basicWriteValidations(server) {
  if (!server.s.pool) {
    return new MongoError('server instance is not connected');
  }

  if (server.s.pool.isDestroyed()) {
    return new MongoError('server instance pool was destroyed');
  }

  return null;
}

function basicReadValidations(server, options) {
  const error = basicWriteValidations(server, options);
  if (error) {
    return error;
  }

  if (options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    return new Error('readPreference must be an instance of ReadPreference');
  }
}

function saslSupportedMechs(options) {
  if (!options) {
    return {};
  }

  const authArray = options.auth || [];
  const authMechanism = authArray[0] || options.authMechanism;
  const authSource = authArray[1] || options.authSource || options.dbName || 'admin';
  const user = authArray[2] || options.user;

  if (typeof authMechanism === 'string' && authMechanism.toUpperCase() !== 'DEFAULT') {
    return {};
  }

  if (!user) {
    return {};
  }

  return { saslSupportedMechs: `${authSource}.${user}` };
}

function extractIsMasterError(err, result) {
  if (err) return err;
  if (result && result.result && result.result.ok === 0) {
    return new MongoError(result.result);
  }
}

function executeServerHandshake(server, callback) {
  // construct an `ismaster` query
  const compressors =
    server.s.options.compression && server.s.options.compression.compressors
      ? server.s.options.compression.compressors
      : [];

  const queryOptions = { numberToSkip: 0, numberToReturn: -1, checkKeys: false, slaveOk: true };
  const query = new Query(
    server.s.bson,
    'admin.$cmd',
    Object.assign(
      { ismaster: true, client: server.s.clientInfo, compression: compressors },
      saslSupportedMechs(server.s.options)
    ),
    queryOptions
  );

  // execute the query
  server.s.pool.write(
    query,
    { socketTimeout: server.s.options.connectionTimeout || 2000 },
    callback
  );
}

function configureWireProtocolHandler(ismaster) {
  // 3.2 wire protocol handler
  if (ismaster.maxWireVersion >= 4) {
    return new ThreeTwoWireProtocolSupport(new TwoSixWireProtocolSupport());
  }

  // default to 2.6 wire protocol handler
  return new TwoSixWireProtocolSupport();
}

function connectEventHandler(server) {
  return function() {
    // log information of received information if in info mode
    // if (server.s.logger.isInfo()) {
    //   var object = err instanceof MongoError ? JSON.stringify(err) : {};
    //   server.s.logger.info(`server ${server.name} fired event ${event} out with message ${object}`);
    // }

    // begin initial server handshake
    const start = process.hrtime();
    executeServerHandshake(server, (err, response) => {
      // Set initial lastIsMasterMS - is this needed?
      server.s.lastIsMasterMS = calculateDurationInMs(start);

      const serverError = extractIsMasterError(err, response);
      if (serverError) {
        server.emit('error', serverError);
        return;
      }

      // extract the ismaster from the server response
      const isMaster = response.result;

      // compression negotation
      if (isMaster && isMaster.compression) {
        const localCompressionInfo = server.s.options.compression;
        const localCompressors = localCompressionInfo.compressors;
        for (var i = 0; i < localCompressors.length; i++) {
          if (isMaster.compression.indexOf(localCompressors[i]) > -1) {
            server.s.pool.options.agreedCompressor = localCompressors[i];
            break;
          }
        }

        if (localCompressionInfo.zlibCompressionLevel) {
          server.s.pool.options.zlibCompressionLevel = localCompressionInfo.zlibCompressionLevel;
        }
      }

      // configure the wire protocol handler
      server.s.wireProtocolHandler = configureWireProtocolHandler(isMaster);

      // log the connection event if requested
      if (server.s.logger.isInfo()) {
        server.s.logger.info(
          `server ${server.name} connected with ismaster [${JSON.stringify(isMaster)}]`
        );
      }

      // emit an event indicating that our description has changed
      server.emit(
        'descriptionReceived',
        new ServerDescription(server.description.address, isMaster)
      );

      // emit a connect event
      server.emit('connect', isMaster);
    });
  };
}

function closeEventHandler(server) {
  return function() {
    server.emit('close');
  };
}

module.exports = Server;
