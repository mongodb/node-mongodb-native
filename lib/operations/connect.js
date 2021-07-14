'use strict';

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
const emitDeprecationWarning = require('../utils').emitDeprecationWarning;
const emitWarningOnce = require('../utils').emitWarningOnce;
const fs = require('fs');
const WriteConcern = require('../write_concern');
const CMAP_EVENT_NAMES = require('../cmap/events').CMAP_EVENT_NAMES;

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
  PLAIN: 'plain',
  GSSAPI: 'gssapi',
  'MONGODB-CR': 'mongocr',
  'MONGODB-X509': 'x509',
  'MONGODB-AWS': 'mongodb-aws',
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
  'PLAIN',
  'GSSAPI',
  'MONGODB-CR',
  'MONGODB-X509',
  'MONGODB-AWS',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256'
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
  'writeConcern',
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
  'bsonRegExp',
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
  'serverApi',
  'retryWrites',
  'retryReads',
  'useNewUrlParser',
  'useUnifiedTopology',
  'serverSelectionTimeoutMS',
  'useRecoveryToken',
  'autoEncryption',
  'driverInfo',
  'tls',
  'tlsInsecure',
  'tlsinsecure',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsCAFile',
  'tlsCertificateFile',
  'tlsCertificateKeyFile',
  'tlsCertificateKeyFilePassword',
  'minHeartbeatFrequencyMS',
  'heartbeatFrequencyMS',
  'directConnection',
  'appName',

  // CMAP options
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS'
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
        emitWarningOnce(`the options [${name}] is not supported`);
      }
    }

    if (legacyOptionNames.indexOf(name) !== -1) {
      emitWarningOnce(
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

  if (!(topology instanceof NativeTopology)) {
    topology.s.sessionPool = new ServerSessionPool(topology.s.coreTopology);
  }
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

function resolveTLSOptions(options) {
  if (options.tls == null) {
    return;
  }

  ['sslCA', 'sslKey', 'sslCert'].forEach(optionName => {
    if (options[optionName]) {
      options[optionName] = fs.readFileSync(options[optionName]);
    }
  });
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

  const useNewUrlParser = options.useNewUrlParser !== false;

  const parseFn = useNewUrlParser ? parse : legacyParse;
  const transform = useNewUrlParser ? transformUrlOptions : legacyTransformUrlOptions;

  parseFn(url, options, (err, _object) => {
    // Do not attempt to connect if parsing error
    if (err) return callback(err);

    // Flatten
    const object = transform(_object);

    // Parse the string
    const _finalOptions = createUnifiedOptions(object, options);

    // Check if we have connection and socket timeout set
    if (_finalOptions.socketTimeoutMS == null) _finalOptions.socketTimeoutMS = 0;
    if (_finalOptions.connectTimeoutMS == null) _finalOptions.connectTimeoutMS = 10000;
    if (_finalOptions.retryWrites == null) _finalOptions.retryWrites = true;
    if (_finalOptions.useRecoveryToken == null) _finalOptions.useRecoveryToken = true;
    if (_finalOptions.readPreference == null) _finalOptions.readPreference = 'primary';

    if (_finalOptions.db_options && _finalOptions.db_options.auth) {
      delete _finalOptions.db_options.auth;
    }

    // resolve tls options if needed
    resolveTLSOptions(_finalOptions);

    // Store the merged options object
    mongoClient.s.options = _finalOptions;

    // Apply read and write concern from parsed url
    mongoClient.s.readPreference = ReadPreference.fromOptions(_finalOptions);
    mongoClient.s.writeConcern = WriteConcern.fromOptions(_finalOptions);

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

    emitWarningOnce(
      'Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor.'
    );

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

const DEPRECATED_UNIFIED_EVENTS = new Set([
  'reconnect',
  'reconnectFailed',
  'attemptReconnect',
  'joined',
  'left',
  'ping',
  'ha',
  'all',
  'fullsetup',
  'open'
]);

function registerDeprecatedEventNotifiers(client) {
  client.on('newListener', eventName => {
    if (DEPRECATED_UNIFIED_EVENTS.has(eventName)) {
      emitDeprecationWarning(
        `The \`${eventName}\` event is no longer supported by the unified topology, please read more by visiting http://bit.ly/2D8WfT6`,
        'DeprecationWarning'
      );
    }
  });
}

function createTopology(mongoClient, topologyType, options, callback) {
  // Pass in the promise library
  options.promiseLibrary = mongoClient.s.promiseLibrary;

  const translationOptions = {};
  if (topologyType === 'unified') translationOptions.createServers = false;

  // Set default options
  const servers = translateOptions(options, translationOptions);

  // determine CSFLE support
  if (options.autoEncryption != null) {
    const Encrypter = require('../encrypter').Encrypter;
    options.encrypter = new Encrypter(mongoClient, options);
    options.autoEncrypter = options.encrypter.autoEncrypter;
  }

  // Create the topology
  let topology;
  if (topologyType === 'mongos') {
    topology = new Mongos(servers, options);
  } else if (topologyType === 'replicaset') {
    topology = new ReplSet(servers, options);
  } else if (topologyType === 'unified') {
    topology = new NativeTopology(options.servers, options);
    registerDeprecatedEventNotifiers(mongoClient);
  }

  // Add listeners
  addListeners(mongoClient, topology);

  // Propagate the events to the client
  relayEvents(mongoClient, topology);

  // Open the connection
  assignTopology(mongoClient, topology);

  // initialize CSFLE if requested
  if (options.autoEncrypter) {
    options.autoEncrypter.init(err => {
      if (err) {
        callback(err);
        return;
      }

      topology.connect(options, err => {
        if (err) {
          topology.close(true);
          callback(err);
          return;
        }

        options.encrypter.connectInternalClient(error => {
          if (error) return callback(error);
          callback(undefined, topology);
        });
      });
    });

    return;
  }

  // otherwise connect normally
  topology.connect(options, err => {
    if (err) {
      topology.close(true);
      return callback(err);
    }

    callback(undefined, topology);
    return;
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
  const noMerge = ['readconcern', 'compression', 'autoencryption'];
  const skip = ['w', 'wtimeout', 'j', 'journal', 'fsync', 'writeconcern'];

  for (const name in options) {
    if (skip.indexOf(name.toLowerCase()) !== -1) {
      continue;
    } else if (noMerge.indexOf(name.toLowerCase()) !== -1) {
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

  // Handle write concern keys separately, since `options` may have the keys at the top level or
  // under `options.writeConcern`. The final merged keys will be under `finalOptions.writeConcern`.
  // This way, `fromOptions` will warn once if `options` is using deprecated write concern options
  const optionsWriteConcern = WriteConcern.fromOptions(options);
  if (optionsWriteConcern) {
    finalOptions.writeConcern = Object.assign({}, finalOptions.writeConcern, optionsWriteConcern);
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
  const mechanismProperties = options.authMechanismProperties;

  if (!VALID_AUTH_MECHANISMS.has(authMechanism)) {
    throw MongoError.create({
      message: `authentication mechanism ${authMechanismRaw} not supported', options.authMechanism`,
      driver: true
    });
  }

  return new MongoCredentials({
    mechanism: AUTH_MECHANISM_INTERNAL_MAP[authMechanism],
    mechanismProperties,
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
    // APM
    'commandStarted',
    'commandSucceeded',
    'commandFailed',

    // SDAM
    'serverOpening',
    'serverClosed',
    'serverDescriptionChanged',
    'serverHeartbeatStarted',
    'serverHeartbeatSucceeded',
    'serverHeartbeatFailed',
    'topologyOpening',
    'topologyClosed',
    'topologyDescriptionChanged',

    // Legacy
    'joined',
    'left',
    'ping',
    'ha'
  ].concat(CMAP_EVENT_NAMES);

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

  if (object.maxPoolSize) {
    object.poolSize = object.maxPoolSize;
  }

  if (object.readConcernLevel) {
    object.readConcern = new ReadConcern(object.readConcernLevel);
  }

  if (object.wTimeoutMS) {
    object.wtimeout = object.wTimeoutMS;
    object.wTimeoutMS = undefined;
  }

  if (_object.srvHost) {
    object.srvHost = _object.srvHost;
  }

  // Any write concern options from the URL will be top-level, so we manually
  // move them options under `object.writeConcern` to avoid warnings later
  const wcKeys = ['w', 'wtimeout', 'j', 'journal', 'fsync'];
  for (const key of wcKeys) {
    if (object[key] !== undefined) {
      if (object.writeConcern === undefined) object.writeConcern = {};
      object.writeConcern[key] = object[key];
      object[key] = undefined;
    }
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
  if (options.socketTimeoutMS == null) options.socketTimeoutMS = 0;
  if (options.connectTimeoutMS == null) options.connectTimeoutMS = 10000;

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

module.exports = { validOptions, connect };
