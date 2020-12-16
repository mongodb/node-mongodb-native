import * as fs from 'fs';
import { Logger } from '../logger';
import { ReadPreference } from '../read_preference';
import { MongoError, AnyError } from '../error';
import { ServerAddress, Topology, TopologyOptions } from '../sdam/topology';
import { AUTH_MECHANISMS, parseConnectionString } from '../connection_string';
import { ReadConcern } from '../read_concern';
import { emitDeprecationWarning, Callback } from '../utils';
import { CMAP_EVENT_NAMES } from '../cmap/events';
import { MongoCredentials } from '../cmap/auth/mongo_credentials';
import * as BSON from '../bson';
import type { Document } from '../bson';
import type { MongoClient } from '../mongo_client';
import { ConnectionOptions, Connection } from '../cmap/connection';
import { AuthMechanism, AuthMechanismId } from '../cmap/auth/defaultAuthProviders';
import { Server } from '../sdam/server';
import { WRITE_CONCERN_KEYS } from '../write_concern';

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
  'writeConcern',
  'forceServerObjectId',
  'serializeFunctions',
  'ignoreUndefined',
  'raw',
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
  'username',
  'host',
  'password',
  'authMechanism',
  'compression',
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

interface MongoClientOptions extends TopologyOptions, Omit<ConnectionOptions, 'host'> {
  tls: boolean;
  servers: string | ServerAddress[];
  autoEncryption: null;
  validateOptions: boolean;
  readPreference?: ReadPreference;

  sslCA: string | Buffer;
  sslKey: string | Buffer;
  sslCert: string | Buffer;
}

// Validate options object
export function validOptions(options?: MongoClientOptions): void | MongoError {
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

const LEGACY_OPTIONS_MAP = validOptionNames.reduce((obj, name: string) => {
  obj[name.toLowerCase()] = name;
  return obj;
}, {} as { [key: string]: string });

function addListeners(mongoClient: MongoClient, topology: Topology) {
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

function resolveTLSOptions(options: MongoClientOptions) {
  if (!options.tls) {
    return;
  }

  const keyFileOptionNames = ['sslCA', 'sslKey', 'sslCert'] as const;
  for (const optionName of keyFileOptionNames) {
    if (options[optionName]) {
      options[optionName] = fs.readFileSync(options[optionName]);
    }
  }
}

export function connect(
  mongoClient: MongoClient,
  url: string,
  options: ConnectionOptions,
  callback: Callback<MongoClient>
): void {
  options = Object.assign({}, options);

  // If callback is null throw an exception
  if (!callback) {
    throw new Error('no callback function provided');
  }

  // If a connection already been established, we can terminate early
  if (mongoClient.topology && mongoClient.topology.isConnected()) {
    return callback(undefined, mongoClient);
  }

  let didRequestAuthentication = false;
  const logger = new Logger('MongoClient', options);

  parseConnectionString(url, options, (err, connectionStringOptions) => {
    // Do not attempt to connect if parsing error
    if (err) return callback(err);

    // Flatten
    const urlOptions = transformUrlOptions(connectionStringOptions);

    // Parse the string
    const finalOptions = createUnifiedOptions(urlOptions, options);

    // Check if we have connection and socket timeout set
    if (finalOptions.socketTimeoutMS == null) finalOptions.socketTimeoutMS = 0;
    if (finalOptions.connectTimeoutMS == null) finalOptions.connectTimeoutMS = 10000;
    if (finalOptions.retryWrites == null) finalOptions.retryWrites = true;
    if (finalOptions.useRecoveryToken == null) finalOptions.useRecoveryToken = true;
    if (finalOptions.readPreference == null) finalOptions.readPreference = 'primary';

    if (finalOptions.db_options && finalOptions.db_options.auth) {
      delete finalOptions.db_options.auth;
    }

    // resolve tls options if needed
    resolveTLSOptions(finalOptions);

    // Store the merged options object
    mongoClient.s.options = finalOptions;

    // Failure modes
    if (urlOptions.servers.length === 0) {
      return callback(new Error('connection string must contain at least one seed host'));
    }

    if (finalOptions.auth && !finalOptions.credentials) {
      try {
        didRequestAuthentication = true;
        finalOptions.credentials = generateCredentials(
          mongoClient,
          finalOptions.auth.user,
          finalOptions.auth.password,
          finalOptions
        );
      } catch (err) {
        return callback(err);
      }
    }

    return createTopology(mongoClient, finalOptions, connectCallback);
  });

  function connectCallback(err?: AnyError, topology?: MongoClient) {
    const warningMessage =
      'seed list contains no mongos proxies, replicaset connections requires ' +
      'the parameter replicaSet to be supplied in the URI or options object, ' +
      'mongodb://server:port/db?replicaSet=name';
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

export type ListenerFunction<V1 = unknown, V2 = unknown> = (v1: V1, v2: V2) => boolean;

function createListener<V1, V2>(mongoClient: MongoClient, event: string): ListenerFunction<V1, V2> {
  const eventSet = new Set(['all', 'fullsetup', 'open', 'reconnect']);
  return (v1, v2) => {
    if (eventSet.has(event)) {
      return mongoClient.emit(event, mongoClient);
    }

    return mongoClient.emit(event, v1, v2);
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

function registerDeprecatedEventNotifiers(client: MongoClient) {
  client.on('newListener', (eventName: string) => {
    if (DEPRECATED_UNIFIED_EVENTS.has(eventName)) {
      emitDeprecationWarning(
        `The \`${eventName}\` event is no longer supported by the unified topology, ` +
          'please read more by visiting http://bit.ly/2D8WfT6'
      );
    }
  });
}

function createTopology(mongoClient: MongoClient, options: MongoClientOptions, callback: Callback) {
  // Set default options
  translateOptions(options);

  // determine CSFLE support
  if (options.autoEncryption != null) {
    let AutoEncrypter;
    try {
      require.resolve('mongodb-client-encryption');
    } catch (err) {
      callback(
        new MongoError(
          'Auto-encryption requested, but the module is not installed. ' +
            'Please add `mongodb-client-encryption` as a dependency of your project'
        )
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mongodbClientEncryption = require('mongodb-client-encryption');
      if (typeof mongodbClientEncryption.extension !== 'function') {
        callback(
          new MongoError(
            'loaded version of `mongodb-client-encryption` does not have property `extension`. ' +
              'Please make sure you are loading the correct version of `mongodb-client-encryption`'
          )
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AutoEncrypter = mongodbClientEncryption.extension(require('../../lib/index')).AutoEncrypter;
    } catch (err) {
      callback(err);
      return;
    }

    const mongoCryptOptions = Object.assign({ bson: BSON }, options.autoEncryption);
    options.autoEncrypter = new AutoEncrypter(mongoClient, mongoCryptOptions);
  }

  // Create the topology
  const topology = new Topology(options.servers, options);
  registerDeprecatedEventNotifiers(mongoClient);

  // Add listeners
  addListeners(mongoClient, topology);

  // Propagate the events to the client
  relayEvents(mongoClient, topology);

  // Assign the topology
  mongoClient.topology = topology;

  // initialize CSFLE if requested
  if (options.autoEncrypter) {
    options.autoEncrypter.init(err => {
      if (err) {
        callback(err);
        return;
      }

      topology.connect(options, err => {
        if (err) {
          topology.close({ force: true });
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
      topology.close({ force: true });
      return callback(err);
    }

    callback(undefined, topology);
    return;
  });
}

function createUnifiedOptions(finalOptions: any, options: any) {
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
    if (name === 'writeConcern') {
      finalOptions[name] = { ...finalOptions[name], ...options[name] };
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

  return finalOptions;
}

export interface GenerateCredentialsOptions {
  authSource: string;
  authdb: string;
  dbName: string;
  authMechanism: AuthMechanismId;
  authMechanismProperties: Document;
}

function generateCredentials(
  client: MongoClient,
  username: string,
  password: string,
  options: GenerateCredentialsOptions
) {
  options = Object.assign({}, options);

  // the default db to authenticate against is 'self'
  // if authenticate is called from a retry context, it may be another one, like admin
  const source = options.authSource || options.authdb || options.dbName;

  // authMechanism
  const authMechanismRaw = options.authMechanism || AuthMechanism.MONGODB_DEFAULT;
  const mechanism = authMechanismRaw.toUpperCase() as AuthMechanismId;
  const mechanismProperties = options.authMechanismProperties;

  if (!AUTH_MECHANISMS.has(mechanism)) {
    throw new MongoError(`authentication mechanism ${mechanism} not supported`);
  }

  return new MongoCredentials({
    mechanism,
    mechanismProperties,
    source,
    username,
    password
  });
}

function mergeOptions<T, S>(target: T, source: S, flatten: boolean): S & T {
  for (const name in source) {
    if (source[name] && typeof source[name] === 'object' && flatten) {
      target = mergeOptions(target, source[name], flatten);
    } else {
      target = Object.assign(target, { [name]: source[name] });
    }
  }

  return target as S & T;
}

function relayEvents(mongoClient: MongoClient, topology: Topology) {
  const serverOrCommandEvents = [
    // APM
    Connection.COMMAND_STARTED,
    Connection.COMMAND_SUCCEEDED,
    Connection.COMMAND_FAILED,

    // SDAM
    Topology.SERVER_OPENING,
    Topology.SERVER_CLOSED,
    Topology.SERVER_DESCRIPTION_CHANGED,
    Server.SERVER_HEARTBEAT_STARTED,
    Server.SERVER_HEARTBEAT_SUCCEEDED,
    Server.SERVER_HEARTBEAT_FAILED,
    Topology.TOPOLOGY_OPENING,
    Topology.TOPOLOGY_CLOSED,
    Topology.TOPOLOGY_DESCRIPTION_CHANGED,

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

function transformUrlOptions(connStrOptions: any) {
  const connStrOpts = Object.assign({ servers: connStrOptions.hosts }, connStrOptions.options);
  for (const name in connStrOpts) {
    const camelCaseName = LEGACY_OPTIONS_MAP[name];
    if (camelCaseName) {
      connStrOpts[camelCaseName] = connStrOpts[name];
    }
  }

  const hasUsername = connStrOptions.auth && connStrOptions.auth.username;
  const hasAuthMechanism = connStrOptions.options && connStrOptions.options.authMechanism;
  if (hasUsername || hasAuthMechanism) {
    connStrOpts.auth = Object.assign({}, connStrOptions.auth);
    if (connStrOpts.auth.db) {
      connStrOpts.authSource = connStrOpts.authSource || connStrOpts.auth.db;
    }

    if (connStrOpts.auth.username) {
      connStrOpts.auth.user = connStrOpts.auth.username;
    }
  }

  if (connStrOptions.defaultDatabase) {
    connStrOpts.dbName = connStrOptions.defaultDatabase;
  }

  if (connStrOpts.maxPoolSize) {
    connStrOpts.poolSize = connStrOpts.maxPoolSize;
  }

  if (connStrOpts.readConcernLevel) {
    connStrOpts.readConcern = new ReadConcern(connStrOpts.readConcernLevel);
  }

  if (connStrOpts.wTimeoutMS) {
    connStrOpts.wtimeout = connStrOpts.wTimeoutMS;
    connStrOpts.wTimeoutMS = undefined;
  }

  if (connStrOptions.srvHost) {
    connStrOpts.srvHost = connStrOptions.srvHost;
  }

  // Any write concern options from the URL will be top-level, so we manually
  // move them options under `object.writeConcern`
  for (const key of WRITE_CONCERN_KEYS) {
    if (connStrOpts[key] !== undefined) {
      if (connStrOpts.writeConcern === undefined) connStrOpts.writeConcern = {};
      connStrOpts.writeConcern[key] = connStrOpts[key];
      connStrOpts[key] = undefined;
    }
  }

  return connStrOpts;
}

function translateOptions(options: any) {
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

  const translations = {
    // SSL translation options
    sslCA: 'ca',
    sslCRL: 'crl',
    sslValidate: 'rejectUnauthorized',
    sslKey: 'key',
    sslCert: 'cert',
    sslPass: 'passphrase',
    // SocketTimeout translation options
    socketTimeoutMS: 'socketTimeout',
    connectTimeoutMS: 'connectionTimeout',
    // Replicaset options
    replicaSet: 'setName',
    rs_name: 'setName',
    secondaryAcceptableLatencyMS: 'acceptableLatency',
    connectWithNoPrimary: 'secondaryOnlyConnectionAllowed',
    // Mongos options
    acceptableLatencyMS: 'localThresholdMS'
  } as { [key: string]: string };

  for (const name in options) {
    if (translations[name]) {
      options[translations[name]] = options[name];
    }
  }
}
