'use strict';

const fs = require('fs');
const Logger = require('../logger');
const ReadPreference = require('../read_preference');
const { MongoError } = require('../error');
const NativeTopology = require('../topologies/native_topology');
const { parseConnectionString } = require('../connection_string');
const ReadConcern = require('../read_concern');
const { ServerSessionPool } = require('../sessions');
const { emitDeprecationWarning } = require('../utils');
const { CMAP_EVENT_NAMES } = require('../cmap/events');
const { MongoCredentials } = require('../cmap/auth/mongo_credentials');
const { BSON } = require('../deps');

const AUTH_MECHANISM_INTERNAL_MAP = {
  DEFAULT: 'default',
  PLAIN: 'plain',
  'MONGODB-CR': 'mongocr',
  'MONGODB-X509': 'x509',
  'MONGODB-AWS': 'mongodb-aws',
  'SCRAM-SHA-1': 'scram-sha-1',
  'SCRAM-SHA-256': 'scram-sha-256'
};

const VALID_AUTH_MECHANISMS = new Set([
  'DEFAULT',
  'PLAIN',
  'MONGODB-CR',
  'MONGODB-X509',
  'MONGODB-AWS',
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
  'serverSelectionTimeoutMS',
  'useRecoveryToken',
  'autoEncryption',
  'driverInfo',
  'tls',
  'tlsInsecure',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsDisableCertificateRevocationCheck',
  'tlsDisableOCSPEndpointCheck',
  'tlsCAFile',
  'tlsCertificateFile',
  'tlsCertificateKeyFile',
  'tlsCertificateKeyFilePassword',
  'minHeartbeatFrequencyMS',
  'heartbeatFrequencyMS',
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
  const logger = new Logger('MongoClient', options);

  parseConnectionString(url, options, (err, _object) => {
    // Do not attempt to connect if parsing error
    if (err) return callback(err);

    // Flatten
    const object = transformUrlOptions(_object);

    // Parse the string
    const _finalOptions = createUnifiedOptions(object, options);

    // Check if we have connection and socket timeout set
    if (_finalOptions.socketTimeoutMS == null) _finalOptions.socketTimeoutMS = 360000;
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

    return createTopology(mongoClient, _finalOptions, connectCallback);
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

function createListener(mongoClient, event) {
  const eventSet = new Set(['all', 'fullsetup', 'open', 'reconnect']);
  return (v1, v2) => {
    if (eventSet.has(event)) {
      return mongoClient.emit(event, mongoClient);
    }

    mongoClient.emit(event, v1, v2);
  };
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

function createTopology(mongoClient, options, callback) {
  // Pass in the promise library
  options.promiseLibrary = mongoClient.s.promiseLibrary;

  const translationOptions = {
    createServers: false
  };

  // Set default options
  translateOptions(options, translationOptions);

  // determine CSFLE support
  if (options.autoEncryption != null) {
    let AutoEncrypter;
    try {
      require.resolve('mongodb-client-encryption');
    } catch (err) {
      callback(
        new MongoError(
          'Auto-encryption requested, but the module is not installed. Please add `mongodb-client-encryption` as a dependency of your project'
        )
      );
      return;
    }

    try {
      let mongodbClientEncryption = require('mongodb-client-encryption');
      if (typeof mongodbClientEncryption.extension !== 'function') {
        callback(
          new MongoError(
            'loaded version of `mongodb-client-encryption` does not have property `extension`. Please make sure you are loading the correct version of `mongodb-client-encryption`'
          )
        );
      }
      AutoEncrypter = mongodbClientEncryption.extension(require('../../index')).AutoEncrypter;
    } catch (err) {
      callback(err);
      return;
    }

    const mongoCryptOptions = Object.assign({ bson: BSON }, options.autoEncryption);
    options.autoEncrypter = new AutoEncrypter(mongoClient, mongoCryptOptions);
  }

  // Create the topology
  const topology = new NativeTopology(options.servers, options);
  registerDeprecatedEventNotifiers(mongoClient);

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

        callback(undefined, topology);
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
  const mechanismProperties = options.authMechanismProperties;

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
    mechanismProperties,
    source,
    username,
    password
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
  }

  if (_object.srvHost) {
    object.srvHost = _object.srvHost;
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
  if (options.connectTimeoutMS == null) options.connectTimeoutMS = 10000;
}

module.exports = { validOptions, connect };
