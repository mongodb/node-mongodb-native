'use strict';

const authenticate = require('../authenticate');
const deprecate = require('util').deprecate;
const Logger = require('mongodb-core').Logger;
const MongoError = require('mongodb-core').MongoError;
const Mongos = require('../topologies/mongos');
const parse = require('mongodb-core').parseConnectionString;
const ReadPreference = require('mongodb-core').ReadPreference;
const ReplSet = require('../topologies/replset');
const Server = require('../topologies/server');
const ServerSessionPool = require('mongodb-core').Sessions.ServerSessionPool;

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
  'fullsetup'
];
const ignoreOptionNames = ['native_parser'];
const legacyOptionNames = ['server', 'replset', 'replSet', 'mongos', 'db'];
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
  'validateOptions',
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
  'useNewUrlParser'
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
  topology.s.sessionPool = new ServerSessionPool(topology.s.coreTopology);
}

// Clear out all events
function clearAllEvents(topology) {
  monitoringEvents.forEach(event => topology.removeAllListeners(event));
}

// Collect all events in order from SDAM
function collectEvents(mongoClient, topology) {
  const MongoClient = require('../mongo_client');
  const collectedEvents = [];

  if (mongoClient instanceof MongoClient) {
    monitoringEvents.forEach(event => {
      topology.on(event, (object1, object2) => {
        collectedEvents.push({
          event: event,
          object1: object1,
          object2: object2
        });
      });
    });
  }

  return collectedEvents;
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
  options = Object.assign({}, options);

  // If callback is null throw an exception
  if (callback == null) {
    throw new Error('no callback function provided');
  }

  // Get a logger for MongoClient
  const logger = Logger('MongoClient', options);

  // Did we pass in a Server/ReplSet/Mongos
  if (url instanceof Server || url instanceof ReplSet || url instanceof Mongos) {
    return connectWithUrl(mongoClient, url, options, connectCallback);
  }

  const parseFn = options.useNewUrlParser ? parse : legacyParse;
  const transform = options.useNewUrlParser ? transformUrlOptions : legacyTransformUrlOptions;

  parseFn(url, options, (err, _object) => {
    // Do not attempt to connect if parsing error
    if (err) return callback(err);

    // Flatten
    const object = transform(_object);

    // Parse the string
    const _finalOptions = createUnifiedOptions(object, options);

    // Check if we have connection and socket timeout set
    if (_finalOptions.socketTimeoutMS == null) _finalOptions.socketTimeoutMS = 360000;
    if (_finalOptions.connectTimeoutMS == null) _finalOptions.connectTimeoutMS = 30000;

    if (_finalOptions.db_options && _finalOptions.db_options.auth) {
      delete _finalOptions.db_options.auth;
    }

    // Store the merged options object
    mongoClient.s.options = _finalOptions;

    // Failure modes
    if (object.servers.length === 0) {
      return callback(new Error('connection string must contain at least one seed host'));
    }

    // Do we have a replicaset then skip discovery and go straight to connectivity
    if (_finalOptions.replicaSet || _finalOptions.rs_name) {
      return createTopology(
        mongoClient,
        'replicaset',
        _finalOptions,
        connectHandler(mongoClient, _finalOptions, connectCallback)
      );
    } else if (object.servers.length > 1) {
      return createTopology(
        mongoClient,
        'mongos',
        _finalOptions,
        connectHandler(mongoClient, _finalOptions, connectCallback)
      );
    } else {
      return createServer(
        mongoClient,
        _finalOptions,
        connectHandler(mongoClient, _finalOptions, connectCallback)
      );
    }
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
      return handleConnectCallback(err, topology, callback);
    }

    // No authentication just reconnect
    if (!options.auth) {
      return handleConnectCallback(err, topology, callback);
    }

    // Authenticate
    authenticate(client, options.user, options.password, options, (err, success) => {
      if (success) {
        handleConnectCallback(null, topology, callback);
      } else {
        if (topology) topology.close();
        const authError = err ? err : new Error('Could not authenticate user ' + options.auth[0]);
        handleConnectCallback(authError, topology, callback);
      }
    });
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

  // Connect
  return url.connect(
    options,
    connectHandler(mongoClient, options, (err, topology) => {
      if (err) return connectCallback(err, topology);
      if (options.user || options.password || options.authMechanism) {
        return authenticate(mongoClient, options.user, options.password, options, err => {
          if (err) return connectCallback(err, topology);
          connectCallback(err, topology);
        });
      }

      connectCallback(err, topology);
    })
  );
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

  // Propagate the events to the client
  const collectedEvents = collectEvents(mongoClient, servers[0]);

  // Connect to topology
  servers[0].connect(options, (err, topology) => {
    if (err) return callback(err);
    // Clear out all the collected event listeners
    clearAllEvents(servers[0]);

    // Relay all the events
    relayEvents(mongoClient, servers[0]);
    // Add listeners
    addListeners(mongoClient, servers[0]);
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

  // Set default options
  const servers = translateOptions(options);

  // Create the topology
  let topology;
  if (topologyType === 'mongos') {
    topology = new Mongos(servers, options);
  } else if (topologyType === 'replicaset') {
    topology = new ReplSet(servers, options);
  }

  // Add listeners
  addListeners(mongoClient, topology);

  // Propagate the events to the client
  relayEvents(mongoClient, topology);

  // Open the connection
  topology.connect(options, (err, topology) => {
    if (err) return callback(err);

    assignTopology(mongoClient, topology);
    callback(null, topology);
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

function transformUrlOptions(_object) {
  let object = Object.assign({ servers: _object.hosts }, _object.options);
  for (let name in object) {
    const camelCaseName = validOptionsLowerCaseToCamelCase[name];
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
      object.dbName = auth.db;
    }
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

function translateOptions(options) {
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

  // Create server instances
  return options.servers.map(serverObj => {
    return serverObj.domain_socket
      ? new Server(serverObj.domain_socket, 27017, options)
      : new Server(serverObj.host, serverObj.port, options);
  });
}

// Validate options object
function validOptions(options) {
  const _validOptions = validOptionNames.concat(legacyOptionNames);

  for (const name in options) {
    if (ignoreOptionNames.indexOf(name) !== -1) {
      continue;
    }

    if (_validOptions.indexOf(name) === -1 && options.validateOptions) {
      return new MongoError(`option ${name} is not supported`);
    } else if (_validOptions.indexOf(name) === -1) {
      console.warn(`the options [${name}] is not supported`);
    }

    if (legacyOptionNames.indexOf(name) !== -1) {
      console.warn(
        `the server/replset/mongos options are deprecated, ` +
          `all their options are supported at the top level of the options object [${validOptionNames}]`
      );
    }
  }
}

function validOptionsLowerCaseToCamelCase() {
  validOptionNames.reduce((obj, name) => {
    obj[name.toLowerCase()] = name;
    return obj;
  }, {});
}

module.exports = { connectOp, logout, validOptions };
