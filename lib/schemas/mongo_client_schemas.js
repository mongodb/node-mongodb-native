'use strict';
const ClientSession = require('mongodb-core').Sessions.ClientSession;
const ReadPreference = require('mongodb-core').ReadPreference;

const connectSchema = {
  appname: { type: 'string' },
  authMechanism: { type: 'string' },
  authMechanismProperties: { type: 'array' },
  authSource: { type: 'string' },
  compression: { type: 'string', alias: 'compressors' },
  connectTimeoutMS: { type: 'number', default: 30000 },
  heartbeatFrequencyMS: { type: 'number', default: 60000 },
  j: { type: 'boolean', alias: 'journal' },
  secondaryAcceptableLatencyMS: { type: 'number', default: 15, alias: 'localThresholdMS' },
  maxIdleTimeMS: { type: 'number' },
  maxPoolSize: { type: 'number', default: 5, alias: 'poolSize' },
  poolSize: { type: 'number' },
  maxStalenessSeconds: { type: 'number' },
  readConcernLevel: { type: 'string', alias: 'readConcern.level' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  readPreferenceTags: { type: 'object' },
  replicaSet: { type: 'string' },
  retryWrites: { type: 'boolean', default: false },
  serverSelectionTimeoutMS: { type: 'number', default: 30000 },
  serverSelectionTryOnce: { type: 'boolean', default: true },
  socketTimeoutMS: { type: 'number', default: 360000 },
  ssl: { type: 'boolean', default: false },
  tls: { type: 'boolean', default: false },
  tlsAllowInvalidCertificates: { type: 'boolean', default: false },
  tlsAllowInvalidHostnames: { type: 'boolean', default: false },
  tlsCAFile: { type: 'string' },
  tlsCertificateKeyFile: { type: 'string' },
  tlsCertificateKeyFilePassword: { type: 'string' },
  tlsInsecure: { type: 'boolean', default: false },
  w: { type: 'number' },
  wtimeout: { type: 'number', alias: 'wTimeoutMS' },
  zlibCompressionLevel: { type: 'number', default: -1 },
  // TODO: check these old options
  sslCA: { type: 'string' },
  sslCert: { type: 'string' },
  sslValidate: { type: 'boolean', default: true },
  sslKey: { type: 'buffer' },
  sslPass: { type: 'string' },
  sslCRL: { type: 'buffer' },
  autoReconnect: { type: 'boolean', default: true },
  auto_reconnect: { type: 'boolean', default: true },
  noDelay: { type: 'boolean', default: true },
  keepAlive: { type: 'boolean', default: true },
  keepAliveInitialDelay: { type: 'number', default: 30000 },
  family: { type: 'number' },
  reconnectTries: { type: 'number', default: 30 },
  reconnectInterval: { type: 'number', default: 1000 },
  ha: { type: 'boolean', default: true },
  haInterval: { type: 'number', default: 10000 },
  acceptableLatencyMS: { type: 'number', default: 15 },
  connectWithNoPrimary: { type: 'boolean', default: false },
  forceServerObjectId: { type: 'boolean', default: false },
  serializeFunctions: { type: 'boolean', default: false },
  ignoreUndefined: { type: 'boolean', default: false },
  raw: { type: 'boolean', default: false },
  bufferMaxEntries: { type: 'number', default: -1 },
  pkFactory: { type: ['object', 'function'] },
  promiseLibrary: { type: ['object', 'function'] },
  readConcern: { type: 'object' },
  loggerLevel: { type: 'string' },
  logger: { type: ['object', 'function'] },
  promoteValues: { type: 'boolean' },
  promoteBuffers: { type: 'boolean' },
  promoteLongs: { type: 'boolean' },
  domainsEnabled: { type: 'boolean', default: false },
  validateOptions: { type: 'boolean', default: false, deprecated: 'unknownOptionsWarningLevel' },
  checkServerIdentity: { type: ['boolean', 'function'], default: true },
  fsync: { type: 'boolean' },
  numberOfRetries: { type: 'number', default: 5 },
  minSize: { type: 'number' },
  emitError: { type: 'boolean', default: true },
  monitorCommands: { type: 'boolean', default: false },
  useNewUrlParser: { type: 'boolean' },
  useUnifiedTopology: { type: 'boolean' },
  optionsValidationLevel: { type: 'string' },
  unknownOptionsWarningLevel: { type: 'string' },
  host: { type: 'string' },
  auth: { type: 'object' }
};

const dbSchema = {
  noListener: { type: 'boolean', default: false },
  returnNonCachedInstance: { type: 'boolean' },
  readPreference: { overrideOnly: true },
  promiseLibrary: { overrideOnly: true },
  optionsValidationLevel: { type: 'string' }
};

const isConnectedSchema = {
  noListener: { type: 'boolean', default: false },
  returnNonCachedInstance: { type: 'boolean' }
};

const logoutSchema = {
  dbName: { type: 'string' }
};

const startSessionSchema = {
  explicit: { overrideOnly: true },
  causalConsistency: { type: 'boolean' }
};

const watchSchema = {
  fullDocument: { type: 'string', default: 'default' },
  resumeAfter: { type: 'object' },
  maxAwaitTimeMS: { type: 'number' },
  batchSize: { type: 'number' },
  collation: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  startAtClusterTime: { type: 'Timestamp' },
  session: { type: ClientSession },
  optionsValidationLevel: { overrideOnly: true }
};

const withSessionSchema = {
  causalConsistency: { type: 'boolean' }
};

module.exports = {
  connectSchema,
  dbSchema,
  isConnectedSchema,
  logoutSchema,
  startSessionSchema,
  watchSchema,
  withSessionSchema
};
