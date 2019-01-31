'use strict';

const generateCredentials = require('../authenticate').generateCredentials;
const deprecate = require('util').deprecate;
const Logger = require('mongodb-core').Logger;
const MongoError = require('mongodb-core').MongoError;
const Mongos = require('../topologies/mongos');
const parse = require('mongodb-core').parseConnectionString;
const ReadPreference = require('mongodb-core').ReadPreference;
const ReplSet = require('../topologies/replset');
const Server = require('../topologies/server');
const ServerSessionPool = require('mongodb-core').Sessions.ServerSessionPool;
const NativeTopology = require('../topologies/native_topology');
const validate = require('../options_validator').validate;

const connectSchema = require('../schemas/mongo_client_schemas').connectSchema;

let client;
function loadClient() {
  if (!client) {
    client = require('../mongo_client');
  }
  return client;
}

const monitoringEvents = [
  'timeout',
  'close',
  'serverOpening',
  'serverDescriptionChanged',
  'serverHeartbeatStarted',
  'serverHeartbeatSucceeded',
  'serverHeartbeatFailed',
  'serverClosed',
  'topologyOpening',
  'topologyClosed',
  'topologyDescriptionChanged',
  'commandStarted',
  'commandSucceeded',
  'commandFailed',
  'joined',
  'left',
  'ping',
  'ha',
  'all',
  'fullsetup',
  'open'
];
const legacyParse = deprecate(
  require('../url_parser'),
  'current URL string parser is deprecated, and will be removed in a future version. ' +
    'To use the new parser, pass option { useNewUrlParser: true } to MongoClient.connect.'
);
const validOptionNames = [
  'poolSize',
  'ssl',
  'sslValidate',
  'sslCA',
  'sslCert',
  'sslKey',
  'sslPass',
  'sslCRL',
  'autoReconnect',
  'noDelay',
  'keepAlive',
  'keepAliveInitialDelay',
  'connectTimeoutMS',
  'family',
  'socketTimeoutMS',
  'reconnectTries',
  'reconnectInterval',
  'ha',
  'haInterval',
  'replicaSet',
  'secondaryAcceptableLatencyMS',
  'acceptableLatencyMS',
  'connectWithNoPrimary',
  'authSource',
  'w',
  'wtimeout',
  'j',
  'forceServerObjectId',
  'serializeFunctions',
  'ignoreUndefined',
  'raw',
  'bufferMaxEntries',
  'readPreference',
  'pkFactory',
  'promiseLibrary',
  'readConcern',
  'maxStalenessSeconds',
  'loggerLevel',
  'logger',
  'promoteValues',
  'promoteBuffers',
  'promoteLongs',
  'domainsEnabled',
  'checkServerIdentity',
  'appname',
  'auth',
  'user',
  'password',
  'authMechanism',
  'compression',
  'fsync',
  'readPreferenceTags',
  'numberOfRetries',
  'auto_reconnect',
  'minSize',
  'monitorCommands',
  'retryWrites',
  'useNewUrlParser',
  'useUnifiedTopology',
  'optionsValidationLevel',
  'heartbeatFrequencyMS',
  'serverSelectionTimeoutMS',
  'serverSelectionTryOnce',
  'tls',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsInsecure',
  'zlibCompressionLevel',
  'maxPoolSize',
  'emitError'
];

function addListeners(mongoClient, topology) {
  topology.on('authenticated', createListener(mongoClient, 'authenticated'));
  topology.on('error', createListener(mongoClient, 'error'));
  topology.on('timeout', createListener(mongoClient, 'timeout'));
  topology.on('close', createListener(mongoClient, 'close'));
  topology.on('parseError', createListener(mongoClient, 'parseError'));
  topology.once('open', createListener(mongoClient, 'open'));
  topology.once('fullsetup', createListener(mongoClient, 'fullsetup'));
  topology.once('all', createListener(mongoClient, 'all'));
  topology.on('reconnect', createListener(mongoClient, 'reconnect'));
}

function assignTopology(client, topology) {
  client.topology = topology;

  if (topology instanceof NativeTopology) {
    topology.s.sessionPool = new ServerSessionPool(topology);
  } else {
    topology.s.sessionPool = new ServerSessionPool(topology.s.coreTopology);
  }
}

// Clear out all events
function clearAllEvents(topology) {
  monitoringEvents.forEach(event => topology.removeAllListeners(event));
}

// Collect all events in order from SDAM
function collectEvents(mongoClient, topology) {
  const MongoClient = loadClient();
  const collectedEvents = [];

  if (mongoClient instanceof MongoClient) {
    monitoringEvents.forEach(event => {
      topology.on(event, (object1, object2) => {
        if (event === 'open') {
          collectedEvents.push({ event: event, object1: mongoClient });
        } else {
          collectedEvents.push({ event: event, object1: object1, object2: object2 });
        }
      });
    });
  }

  return collectedEvents;
}

function parseUrlAndOptions(url, options, callback) {
  options = Object.assign({}, options);

  // If callback is null throw an exception
  if (callback == null) {
    throw new Error('no callback function provided');
  }

  const parseFn = options.useNewUrlParser ? parse : legacyParse;
  const transform = options.useNewUrlParser ? transformUrlOptions : legacyTransformUrlOptions;

  parseFn(url, options, (err, result) => {
    if (err) return callback(err);

    // Failure modes
    const servers = result.servers ? result.servers : result.hosts;
    if (servers.length === 0) {
      return callback(new Error('connection string must contain at least one seed host'));
    }

    const flatOptions = transform(result);
    const finalOptions = createUnifiedOptions(flatOptions, options);
    if (finalOptions.auth && !finalOptions.credentials) {
      try {
        finalOptions.credentials = generateCredentials(finalOptions);
      } catch (err) {
        return callback(err);
      }
    }

    callback(null, finalOptions);
  });
}

/**
 * Connect to MongoDB using a url as documented at
 *
 *  docs.mongodb.org/manual/reference/connection-string/
 *
 * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
 *
 * @method
 * @param {MongoClient} mongoClient The MongoClient instance with which to connect.
 * @param {string} url The connection URI string
 * @param {object} [options] Optional settings. See MongoClient.prototype.connect for a list of options.
 * @param {MongoClient~connectCallback} [callback] The command result callback
 */
function connect(mongoClient, url, options, callback) {
  // Did we pass in a Server/ReplSet/Mongos
  if (url instanceof Server || url instanceof ReplSet || url instanceof Mongos) {
    return connectWithUrl(mongoClient, url, options, connectCallback);
  }

  // Get a logger for MongoClient
  const logger = Logger('MongoClient', options);

  parseUrlAndOptions(url, options, (err, finalOptions) => {
    if (err) return callback(err);

    if (options.useNewUrlParser === true) {
      validate(connectSchema, finalOptions, {
        optionsValidationLevel: mongoClient.optionsValidationLevel,
        unknownOptionsWarningLevel: 'none'
      });
    }

    // Store the merged options object
    mongoClient.s.options = finalOptions;

    if (finalOptions.useUnifiedTopology) {
      return createTopology(
        mongoClient,
        'unified',
        finalOptions,
        connectHandler(mongoClient, finalOptions, connectCallback)
      );
    }

    // Do we have a replicaset then skip discovery and go straight to connectivity
    if (finalOptions.replicaSet || finalOptions.rs_name) {
      return createTopology(
        mongoClient,
        'replicaset',
        finalOptions,
        connectHandler(mongoClient, finalOptions, connectCallback)
      );
    }

    if (finalOptions.servers.length > 1) {
      return createTopology(
        mongoClient,
        'mongos',
        finalOptions,
        connectHandler(mongoClient, finalOptions, connectCallback)
      );
    }

    return createServer(
      mongoClient,
      finalOptions,
      connectHandler(mongoClient, finalOptions, connectCallback)
    );
  });

  function connectCallback(err, topology) {
    const warningMessage = `seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name`;
    if (err && err.message === 'no mongos proxies found in seed list') {
      if (logger.isWarn()) {
        logger.warn(warningMessage);
      }

      // Return a more specific error message for MongoClient.connect
      return callback(new MongoError(warningMessage));
    }

    // Return the error and db instance
    callback(err, topology);
  }
}

function connectHandler(client, options, callback) {
  return (err, topology) => {
    if (err) {
      if (topology) topology.close();
      return handleConnectCallback(err, topology, callback);
    }

    if (options.credentials != null) {
      client.emit('authenticated');
    }

    handleConnectCallback(null, topology, callback);
  };
}

/**
 * Connect to MongoDB using a url as documented at
 *
 *  docs.mongodb.org/manual/reference/connection-string/
 *
 * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
 *
 * @method
 * @param {MongoClient} mongoClient The MongoClient instance with which to connect.
 * @param {MongoClient~connectCallback} [callback] The command result callback
 */
function connectOp(mongoClient, err, callback) {
  // Did we have a validation error
  if (err) return callback(err);
  // Fallback to callback based connect
  connect(mongoClient, mongoClient.s.url, mongoClient.s.options, err => {
    if (err) return callback(err);
    callback(null, mongoClient);
  });
}

function connectWithUrl(mongoClient, url, options, connectCallback) {
  // Set the topology
  assignTopology(mongoClient, url);

  // Add listeners
  addListeners(mongoClient, url);

  // Propagate the events to the client
  relayEvents(mongoClient, url);

  let finalOptions = Object.assign({}, options);

  // If we have a readPreference passed in by the db options, convert it from a string
  if (typeof options.readPreference === 'string' || typeof options.read_preference === 'string') {
    finalOptions.readPreference = new ReadPreference(
      options.readPreference || options.read_preference
    );
  }

  const isDoingAuth = finalOptions.user || finalOptions.password || finalOptions.authMechanism;
  if (isDoingAuth && !finalOptions.credentials) {
    try {
      finalOptions.credentials = generateCredentials(finalOptions);
    } catch (err) {
      return connectCallback(err, url);
    }
  }

  // Connect
  return url.connect(finalOptions, connectHandler(mongoClient, finalOptions, connectCallback));
}

function createListener(mongoClient, event) {
  const eventSet = new Set(['all', 'fullsetup', 'open', 'reconnect']);
  return (v1, v2) => {
    if (eventSet.has(event)) {
      return mongoClient.emit(event, mongoClient);
    }

    mongoClient.emit(event, v1, v2);
  };
}

function createServer(mongoClient, options, callback) {
  // Pass in the promise library
  options.promiseLibrary = mongoClient.s.promiseLibrary;

  // Set default options
  const servers = translateOptions(options);

  const server = servers[0];

  // Propagate the events to the client
  const collectedEvents = collectEvents(mongoClient, server);

  // Connect to topology
  server.connect(options, (err, topology) => {
    if (err) {
      server.close(true);
      return callback(err);
    }
    // Clear out all the collected event listeners
    clearAllEvents(server);

    // Relay all the events
    relayEvents(mongoClient, server);
    // Add listeners
    addListeners(mongoClient, server);
    // Check if we are really speaking to a mongos
    const ismaster = topology.lastIsMaster();

    // Set the topology
    assignTopology(mongoClient, topology);

    // Do we actually have a mongos
    if (ismaster && ismaster.msg === 'isdbgrid') {
      // Destroy the current connection
      topology.close();
      // Create mongos connection instead
      return createTopology(mongoClient, 'mongos', options, callback);
    }

    // Fire all the events
    replayEvents(mongoClient, collectedEvents);
    // Otherwise callback
    callback(err, topology);
  });
}

function createTopology(mongoClient, topologyType, options, callback) {
  // Pass in the promise library
  options.promiseLibrary = mongoClient.s.promiseLibrary;

  const translationOptions = {};
  if (topologyType === 'unified') translationOptions.createServers = false;

  // Set default options
  const servers = translateOptions(options, translationOptions);

  // Create the topology
  let topology;
  if (topologyType === 'mongos') {
    topology = new Mongos(servers, options);
  } else if (topologyType === 'replicaset') {
    topology = new ReplSet(servers, options);
  } else if (topologyType === 'unified') {
    topology = new NativeTopology(options.servers, options);
  }

  // Add listeners
  addListeners(mongoClient, topology);

  // Propagate the events to the client
  relayEvents(mongoClient, topology);

  // Open the connection
  topology.connect(options, (err, newTopology) => {
    if (err) {
      topology.close(true);
      return callback(err);
    }

    assignTopology(mongoClient, newTopology);
    callback(null, newTopology);
  });
}

function createUnifiedOptions(finalOptions, options) {
  const childOptions = [
    'mongos',
    'server',
    'db',
    'replset',
    'db_options',
    'server_options',
    'rs_options',
    'mongos_options'
  ];
  const noMerge = ['readconcern', 'compression'];

  for (const name in options) {
    if (noMerge.indexOf(name.toLowerCase()) !== -1) {
      finalOptions[name] = options[name];
    } else if (childOptions.indexOf(name.toLowerCase()) !== -1) {
      finalOptions = mergeOptions(finalOptions, options[name], false);
    } else {
      if (
        options[name] &&
        typeof options[name] === 'object' &&
        !Buffer.isBuffer(options[name]) &&
        !Array.isArray(options[name])
      ) {
        finalOptions = mergeOptions(finalOptions, options[name], true);
      } else {
        finalOptions[name] = options[name];
      }
    }
  }

  return finalOptions;
}

function handleConnectCallback(err, topology, callback) {
  return process.nextTick(() => {
    try {
      callback(err, topology);
    } catch (err) {
      if (topology) topology.close();
      throw err;
    }
  });
}

function legacyTransformUrlOptions(object) {
  return mergeOptions(createUnifiedOptions({}, object), object, false);
}

/**
 * Logout user from server, fire off on all connections and remove all auth info.
 *
 * @method
 * @param {MongoClient} mongoClient The MongoClient instance on which to logout.
 * @param {object} [options] Optional settings. See MongoClient.prototype.logout for a list of options.
 * @param {Db~resultCallback} [callback] The command result callback
 */
function logout(mongoClient, dbName, callback) {
  mongoClient.topology.logout(dbName, err => {
    if (err) return callback(err);
    callback(null, true);
  });
}

function mergeOptions(target, source, flatten) {
  for (const name in source) {
    if (source[name] && typeof source[name] === 'object' && flatten) {
      target = mergeOptions(target, source[name], flatten);
    } else {
      target[name] = source[name];
    }
  }

  return target;
}

function relayEvents(mongoClient, topology) {
  const serverOrCommandEvents = [
    'serverOpening',
    'serverDescriptionChanged',
    'serverHeartbeatStarted',
    'serverHeartbeatSucceeded',
    'serverHeartbeatFailed',
    'serverClosed',
    'topologyOpening',
    'topologyClosed',
    'topologyDescriptionChanged',
    'commandStarted',
    'commandSucceeded',
    'commandFailed',
    'joined',
    'left',
    'ping',
    'ha'
  ];

  serverOrCommandEvents.forEach(event => {
    topology.on(event, (object1, object2) => {
      mongoClient.emit(event, object1, object2);
    });
  });
}

//
// Replay any events due to single server connection switching to Mongos
//
function replayEvents(mongoClient, events) {
  for (let i = 0; i < events.length; i++) {
    mongoClient.emit(events[i].event, events[i].object1, events[i].object2);
  }
}

const LEGACY_OPTIONS_MAP = validOptionNames.reduce((obj, name) => {
  obj[name.toLowerCase()] = name;
  return obj;
}, {});

function transformUrlOptions(_object) {
  let object = Object.assign({ servers: _object.hosts }, _object.options);
  for (let name in object) {
    const camelCaseName = LEGACY_OPTIONS_MAP[name];
    if (camelCaseName) {
      object[camelCaseName] = object[name];
    }
  }
  if (_object.auth) {
    const auth = _object.auth;
    for (let i in auth) {
      if (auth[i]) {
        object[i] = auth[i];
      }
    }

    if (auth.username) {
      object.auth = auth;
      object.user = auth.username;
    }

    if (auth.db) {
      object.authSource = object.authSource || auth.db;
    }
  }

  if (_object.defaultDatabase) {
    object.dbName = _object.defaultDatabase;
  }

  if (object.maxpoolsize) {
    object.poolSize = object.maxpoolsize;
  }

  if (object.readconcernlevel) {
    object.readConcern = { level: object.readconcernlevel };
  }

  if (object.wtimeoutms) {
    object.wtimeout = object.wtimeoutms;
  }

  return object;
}

function translateOptions(options, translationOptions) {
  translationOptions = Object.assign({}, { createServers: true }, translationOptions);

  // If we have a readPreference passed in by the db options
  if (typeof options.readPreference === 'string' || typeof options.read_preference === 'string') {
    options.readPreference = new ReadPreference(options.readPreference || options.read_preference);
  }

  // Do we have readPreference tags, add them
  if (options.readPreference && (options.readPreferenceTags || options.read_preference_tags)) {
    options.readPreference.tags = options.readPreferenceTags || options.read_preference_tags;
  }

  // Do we have maxStalenessSeconds
  if (options.maxStalenessSeconds) {
    options.readPreference.maxStalenessSeconds = options.maxStalenessSeconds;
  }

  // Set the socket and connection timeouts
  if (options.socketTimeoutMS == null) options.socketTimeoutMS = 360000;
  if (options.connectTimeoutMS == null) options.connectTimeoutMS = 30000;

  if (!translationOptions.createServers) {
    return;
  }

  // Create server instances
  return options.servers.map(serverObj => {
    return serverObj.domain_socket
      ? new Server(serverObj.domain_socket, 27017, options)
      : new Server(serverObj.host, serverObj.port, options);
  });
}

module.exports = { connectOp, logout };
