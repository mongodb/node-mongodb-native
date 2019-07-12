'use strict';

const os = require('os');
const OperationBase = require('./operation').OperationBase;
const defineAspects = require('./operation').defineAspects;
const Aspect = require('./operation').Aspect;
const deprecate = require('util').deprecate;
const Logger = require('../core').Logger;
const MongoCredentials = require('../core').MongoCredentials;
const MongoError = require('../core').MongoError;
const Mongos = require('../topologies/mongos');
const NativeTopology = require('../topologies/native_topology');
const parse = require('../core').parseConnectionString;
const ReadConcern = require('../read_concern');
const ReadPreference = require('../core').ReadPreference;
const ReplSet = require('../topologies/replset');
const Server = require('../topologies/server');
const ServerSessionPool = require('../core').Sessions.ServerSessionPool;

let client;
function loadClient() {
  if (!client) {
    client = require('../mongo_client');
  }
  return client;
}

const legacyParse = deprecate(
  require('../url_parser'),
  'current URL string parser is deprecated, and will be removed in a future version. ' +
    'To use the new parser, pass option { useNewUrlParser: true } to MongoClient.connect.'
);

const AUTH_MECHANISM_INTERNAL_MAP = {
  DEFAULT: 'default',
  'MONGODB-CR': 'mongocr',
  PLAIN: 'plain',
  'MONGODB-X509': 'x509',
  'SCRAM-SHA-1': 'scram-sha-1',
  'SCRAM-SHA-256': 'scram-sha-256'
};

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

const VALID_AUTH_MECHANISMS = new Set([
  'DEFAULT',
  'MONGODB-CR',
  'PLAIN',
  'MONGODB-X509',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256',
  'GSSAPI'
]);

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
  'retryReads',
  'useNewUrlParser',
  'useUnifiedTopology',
  'serverSelectionTimeoutMS',
  'useRecoveryToken',
  'autoEncryption'
];

const ignoreOptionNames = ['native_parser'];
const legacyOptionNames = ['server', 'replset', 'replSet', 'mongos', 'db'];

// Validate options object
function validOptions(options) {
  const _validOptions = validOptionNames.concat(legacyOptionNames);

  for (const name in options) {
    if (ignoreOptionNames.indexOf(name) !== -1) {
      continue;
    }

    if (_validOptions.indexOf(name) === -1) {
      if (options.validateOptions) {
        return new MongoError(`option ${name} is not supported`);
      } else {
        console.warn(`the options [${name}] is not supported`);
      }
    }

    if (legacyOptionNames.indexOf(name) !== -1) {
      console.warn(
        `the server/replset/mongos/db options are deprecated, ` +
          `all their options are supported at the top level of the options object [${validOptionNames}]`
      );
    }
  }
}

const LEGACY_OPTIONS_MAP = validOptionNames.reduce((obj, name) => {
  obj[name.toLowerCase()] = name;
  return obj;
}, {});

class ConnectOperation extends OperationBase {
  constructor(mongoClient) {
    super();

    this.mongoClient = mongoClient;
  }

  execute(callback) {
    const mongoClient = this.mongoClient;
    const err = validOptions(mongoClient.s.options);

    // Did we have a validation error
    if (err) return callback(err);
    // Fallback to callback based connect
    connect(mongoClient, mongoClient.s.url, mongoClient.s.options, err => {
      if (err) return callback(err);
      callback(null, mongoClient);
    });
  }
}
defineAspects(ConnectOperation, [Aspect.SKIP_SESSION]);

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
  topology.s.sessionPool =
    topology instanceof NativeTopology
      ? new ServerSessionPool(topology)
      : new ServerSessionPool(topology.s.coreTopology);
}

// Clear out all events
function clearAllEvents(topology) {
  monitoringEvents.forEach(event => topology.removeAllListeners(event));
}

// Collect all events in order from SDAM
function collectEvents(mongoClient, topology) {
  let MongoClient = loadClient();
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

function connect(mongoClient, url, options, callback) {
  options = Object.assign({}, options);

  // If callback is null throw an exception
  if (callback == null) {
    throw new Error('no callback function provided');
  }

  let didRequestAuthentication = false;
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
    if (_finalOptions.retryWrites == null) _finalOptions.retryWrites = true;
    if (_finalOptions.useRecoveryToken == null) _finalOptions.useRecoveryToken = true;

    if (_finalOptions.db_options && _finalOptions.db_options.auth) {
      delete _finalOptions.db_options.auth;
    }

    // Store the merged options object
    mongoClient.s.options = _finalOptions;

    // Failure modes
    if (object.servers.length === 0) {
      return callback(new Error('connection string must contain at least one seed host'));
    }

    if (_finalOptions.auth && !_finalOptions.credentials) {
      try {
        didRequestAuthentication = true;
        _finalOptions.credentials = generateCredentials(
          mongoClient,
          _finalOptions.auth.user,
          _finalOptions.auth.password,
          _finalOptions
        );
      } catch (err) {
        return callback(err);
      }
    }

    if (_finalOptions.useUnifiedTopology) {
      return createTopology(mongoClient, 'unified', _finalOptions, connectCallback);
    }

    // Do we have a replicaset then skip discovery and go straight to connectivity
    if (_finalOptions.replicaSet || _finalOptions.rs_name) {
      return createTopology(mongoClient, 'replicaset', _finalOptions, connectCallback);
    } else if (object.servers.length > 1) {
      return createTopology(mongoClient, 'mongos', _finalOptions, connectCallback);
    } else {
      return createServer(mongoClient, _finalOptions, connectCallback);
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

    if (didRequestAuthentication) {
      mongoClient.emit('authenticated', null, true);
    }

    // Return the error and db instance
    callback(err, topology);
  }
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
      finalOptions.credentials = generateCredentials(
        mongoClient,
        finalOptions.user,
        finalOptions.password,
        finalOptions
      );
    } catch (err) {
      return connectCallback(err, url);
    }
  }

  return url.connect(finalOptions, connectCallback);
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
    if (options.autoEncryption == null) {
      callback(null, newTopology);
      return;
    }

    // setup for client side encryption
    let AutoEncrypter;
    try {
      AutoEncrypter = require('mongodb-client-encryption').AutoEncrypter;
    } catch (err) {
      callback(
        new MongoError(
          'Auto-encryption requested, but the module is not installed. Please add `mongodb-client-encryption` as a dependency of your project'
        )
      );

      return;
    }

    const MongoClient = loadClient();
    let connectionString;
    if (options.autoEncryption.extraOptions && options.autoEncryption.extraOptions.mongocryptURI) {
      connectionString = options.autoEncryption.extraOptions.mongocryptURI;
    } else if (os.platform() === 'win32') {
      connectionString = 'mongodb://localhost:27020/?serverSelectionTimeoutMS=1000';
    } else {
      connectionString = 'mongodb://%2Ftmp%2Fmongocryptd.sock/?serverSelectionTimeoutMS=1000';
    }

    const mongocryptdClient = new MongoClient(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    mongoClient.s.mongocryptdClient = mongocryptdClient;
    mongocryptdClient.connect(err => {
      if (err) return callback(err, null);

      const mongoCryptOptions = Object.assign({}, options.autoEncryption, {
        mongocryptdClient
      });

      topology.s.options.autoEncrypter = new AutoEncrypter(mongoClient, mongoCryptOptions);
      callback(null, newTopology);
    });
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

function generateCredentials(client, username, password, options) {
  options = Object.assign({}, options);

  // the default db to authenticate against is 'self'
  // if authententicate is called from a retry context, it may be another one, like admin
  const source = options.authSource || options.authdb || options.dbName;

  // authMechanism
  const authMechanismRaw = options.authMechanism || 'DEFAULT';
  const authMechanism = authMechanismRaw.toUpperCase();

  if (!VALID_AUTH_MECHANISMS.has(authMechanism)) {
    throw MongoError.create({
      message: `authentication mechanism ${authMechanismRaw} not supported', options.authMechanism`,
      driver: true
    });
  }

  if (authMechanism === 'GSSAPI') {
    return new MongoCredentials({
      mechanism: process.platform === 'win32' ? 'sspi' : 'gssapi',
      mechanismProperties: options,
      source,
      username,
      password
    });
  }

  return new MongoCredentials({
    mechanism: AUTH_MECHANISM_INTERNAL_MAP[authMechanism],
    source,
    username,
    password
  });
}

function legacyTransformUrlOptions(object) {
  return mergeOptions(createUnifiedOptions({}, object), object, false);
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
    const camelCaseName = LEGACY_OPTIONS_MAP[name];
    if (camelCaseName) {
      object[camelCaseName] = object[name];
    }
  }

  const hasUsername = _object.auth && _object.auth.username;
  const hasAuthMechanism = _object.options && _object.options.authMechanism;
  if (hasUsername || hasAuthMechanism) {
    object.auth = Object.assign({}, _object.auth);
    if (object.auth.db) {
      object.authSource = object.authSource || object.auth.db;
    }

    if (object.auth.username) {
      object.auth.user = object.auth.username;
    }
  }

  if (_object.defaultDatabase) {
    object.dbName = _object.defaultDatabase;
  }

  if (object.maxpoolsize) {
    object.poolSize = object.maxpoolsize;
  }

  if (object.readconcernlevel) {
    object.readConcern = new ReadConcern(object.readconcernlevel);
  }

  if (object.wtimeoutms) {
    object.wtimeout = object.wtimeoutms;
  }

  if (_object.srvHost) {
    object.srvHost = _object.srvHost;
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

module.exports = ConnectOperation;
