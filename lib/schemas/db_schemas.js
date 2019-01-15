'use strict';
const ClientSession = require('mongodb-core').Sessions.ClientSession;
const ReadPreference = require('mongodb-core').ReadPreference;

const addUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  customData: { type: 'object' },
  roles: { type: 'object' },
  authenticationRestrictions: { type: 'array' },
  mechanisms: { type: 'array' },
  passwordDigestor: { type: 'string' },
  session: { type: ClientSession }
};

const collectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  raw: { type: 'boolean' },
  pkFactory: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  serializeFunctions: { type: 'boolean' },
  strict: { type: 'boolean' },
  readConcern: { type: 'object' },
  promiseLibrary: { overrideOnly: true },
  ignoreUndefined: { overrideOnly: true },
  fsync: { type: 'number' }
};

const collectionsSchema = {
  nameOnly: { type: 'boolean', default: false },
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};

const commandSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};

const createCollectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  raw: { type: 'boolean' },
  pkFactory: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  serializeFunctions: { type: 'boolean' },
  strict: { type: 'boolean' },
  capped: { type: 'boolean' },
  autoIndexId: { type: 'boolean', deprecated: true },
  size: { type: 'number' },
  max: { type: 'number' },
  flags: { type: 'number' },
  storageEngine: { type: 'object' },
  validator: { type: 'object' },
  validationLevel: { type: 'string' },
  validationAction: { type: 'string' },
  indexOptionDefaults: { type: 'object' },
  viewOn: { type: 'string' },
  pipeline: { type: 'array' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  promiseLibrary: { type: 'function' }
};

const createIndexSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  unique: { type: 'boolean', default: false },
  sparse: { type: 'boolean' },
  background: { type: 'boolean' },
  dropDups: { type: 'boolean' },
  min: { type: 'number' },
  max: { type: 'number' },
  v: { type: 'number' },
  expireAfterSeconds: { type: 'number' },
  name: { type: 'number' },
  partialFilterExpression: { type: 'object' },
  collation: { type: 'object' },
  session: { type: ClientSession }
};

const dropCollectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  readPreference: { overrideOnly: true }
};

const dropDatabaseSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  readPreference: { overrideOnly: true },
  writeConcern: { type: 'object' }
};

const executeDbAdminCommandSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};

const indexInformationSchema = {
  batchSize: { type: 'number' },
  full: { type: 'boolean', default: false },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};

const listCollectionsSchema = {
  nameOnly: { type: 'boolean', default: false },
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession },
  cursorFactory: { overrideOnly: true },
  optionsValidationLevel: { overrideOnly: true }
};

const listCollectionsOperationSchema = {
  nameOnly: { type: 'boolean', default: false },
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession },
  cursorFactory: { type: 'function' },
  optionsValidationLevel: { type: 'string' }
};

const profilingLevelSchema = {
  session: { type: ClientSession }
};

const removeUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession }
};

const renameCollectionSchema = {
  dropTarget: { type: 'boolean', default: false },
  session: { type: ClientSession },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'string', 'object'], overrideOnly: true }
};

const setProfilingLevelSchema = {
  session: { type: ClientSession }
};

const statsSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  scale: { type: 'number' },
  session: { type: ClientSession }
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

module.exports = {
  addUserSchema,
  collectionSchema,
  collectionsSchema,
  commandSchema,
  createCollectionSchema,
  createIndexSchema,
  dropCollectionSchema,
  dropDatabaseSchema,
  executeDbAdminCommandSchema,
  indexInformationSchema,
  listCollectionsSchema,
  listCollectionsOperationSchema,
  profilingLevelSchema,
  removeUserSchema,
  renameCollectionSchema,
  setProfilingLevelSchema,
  statsSchema,
  watchSchema
};
