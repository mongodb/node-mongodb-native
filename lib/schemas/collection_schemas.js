'use strict';
const ReadPreference = require('mongodb-core').ReadPreference;
const ClientSession = require('mongodb-core').Sessions.ClientSession;

const aggregateSchema = {
  readPreference: { type: [ReadPreference, 'string', 'object'] },
  cursor: { type: 'object', default: {} },
  batchSize: { type: 'number' },
  explain: { type: 'boolean' },
  allowDiskUse: { type: 'boolean' },
  maxTimeMS: { type: 'number' },
  bypassDocumentValidation: { type: 'boolean' },
  raw: { type: 'boolean' },
  promoteLongs: { type: 'boolean' },
  promoteValues: { type: 'boolean' },
  promoteBuffers: { type: 'boolean' },
  collation: { type: 'object' },
  comment: { type: 'string' },
  hint: { type: ['object', 'string'] },
  session: { type: ClientSession },
  promiseLibrary: { type: 'function', overrideOnly: true },
  cursorFactory: { overrideOnly: true },
  optionsValidationLevel: { overrideOnly: true },
  readConcern: { type: 'object' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' }
};

const bulkWriteSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  serializeFunctions: { type: 'boolean' },
  ordered: { type: 'boolean', default: true },
  bypassDocumentValidation: { type: 'boolean' },
  ignoreUndefined: { overrideOnly: true },
  session: { type: ClientSession }
};

const countDocumentsSchema = {
  collation: { type: 'object' },
  hint: { type: ['string', 'object'] },
  limit: { type: 'number' },
  maxTimeMS: { type: 'number' },
  skip: { type: 'number' },
  readConcern: { type: 'object' }
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
  name: { type: 'string' },
  partialFilterExpression: { type: 'object' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  readPreference: { overrideOnly: true }
};

const createIndexesSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  maxTimeMS: { type: 'number' },
  readPreference: { overrideOnly: true },
  session: { type: ClientSession }
};

const deleteManySchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  ignoreUndefined: { type: 'boolean', overrideOnly: true },
  single: { overrideOnly: true }
};

const deleteOneSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  ignoreUndefined: { type: 'boolean', overrideOnly: true },
  single: { overrideOnly: true }
};

const distinctSchema = {
  collation: { type: 'object' },
  readPreference: { type: [ReadPreference, 'string', 'object'] },
  maxTimeMS: { type: 'number' },
  session: { type: ClientSession },
  readConcern: { type: 'object' }
};

const dropSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'string', 'object'], overrideOnly: true },
  session: { type: ClientSession }
};

const dropIndexSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'string', 'object'], overrideOnly: true },
  maxTimeMS: { type: 'number' },
  session: { type: ClientSession }
};

const dropIndexesSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  maxTimeMS: { type: 'number' },
  session: { type: ClientSession }
};

const estimatedDocumentCountSchema = {
  maxTimeMS: { type: 'number' },
  readConcern: { type: 'object' }
};

const findSchema = {
  limit: { type: 'number', default: 0 },
  sort: { type: ['array', 'object', 'string'] },
  projection: { type: 'object' },
  fields: { type: 'object' },
  skip: { type: 'number', default: 0 },
  hint: { type: ['string', 'object'] },
  explain: { type: 'boolean' },
  snapshot: { type: 'boolean' },
  timeout: { type: 'boolean' },
  tailable: { type: 'boolean' },
  batchSize: { type: 'number' },
  returnKey: { type: 'boolean' },
  maxScan: { type: 'number' },
  min: { type: 'number' },
  max: { type: 'number' },
  showDiskLoc: { type: 'boolean' },
  showRecordId: { type: 'boolean' },
  comment: { type: 'string' },
  raw: { type: 'boolean' },
  promoteLongs: { type: 'boolean' },
  promoteValues: { type: 'boolean' },
  promoteBuffers: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  partial: { type: 'boolean' },
  maxTimeMS: { type: 'number' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  promiseLibrary: { overrideOnly: true },
  slaveOk: { type: 'boolean' },
  awaitData: { type: 'boolean' },
  noCursorTimeout: { type: 'boolean', overrideOnly: true },
  ignoreUndefined: { overrideOnly: true },
  optionsValidationLevel: { overrideOnly: true },
  readConcern: { type: 'object' }
};

const findAndModifySchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  remove: { type: 'boolean', default: false },
  upsert: { type: 'boolean', default: false },
  new: { type: 'boolean', default: false },
  projection: { type: 'object' },
  fields: { type: 'object' },
  session: { type: ClientSession },
  arrayFilters: { type: 'array' },
  readPreference: { overrideOnly: true },
  serializeFunctions: { type: 'boolean' },
  checkKeys: { overrideOnly: true },
  collation: { type: 'object' }
};

const findAndRemoveSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  remove: { overrideOnly: true },
  readPreference: { overrideOnly: true },
  serializeFunctions: { type: 'boolean' },
  checkKeys: { overrideOnly: true },
  upsert: { overrideOnly: true },
  new: { overrideOnly: true }
};

const findOneSchema = {
  projection: { type: 'object' },
  fields: { type: 'object' },
  hint: { type: ['string', 'object'] },
  explain: { type: 'boolean' },
  snapshot: { type: 'boolean' },
  timeout: { type: 'boolean' },
  tailable: { type: 'boolean' },
  batchSize: { type: 'number' },
  returnKey: { type: 'boolean' },
  maxScan: { type: 'number' },
  min: { type: 'number' },
  max: { type: 'number' },
  showDiskLoc: { type: 'boolean' },
  showRecordId: { type: 'boolean' },
  comment: { type: 'string' },
  raw: { type: 'boolean' },
  promoteLongs: { type: 'boolean' },
  promoteValues: { type: 'boolean' },
  promoteBuffers: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  partial: { type: 'boolean' },
  maxTimeMS: { type: 'number' },
  collation: { type: 'object' },
  session: { type: ClientSession }
};

const findOneAndDeleteSchema = {
  collation: { type: 'object' },
  projection: { type: 'object' },
  sort: { type: ['object', 'string'] },
  maxTimeMS: { type: 'number' },
  session: { type: ClientSession },
  fields: { overrideOnly: true },
  remove: { overrideOnly: true },
  new: { overrideOnly: true },
  upsert: { overrideOnly: true },
  serializeFunctions: { type: 'boolean' },
  checkKeys: { overrideOnly: true },
  readPreference: { overrideOnly: true },
  fsync: { type: 'number' }
};

const findOneAndReplaceSchema = {
  bypassDocumentValidation: { type: 'boolean' },
  collation: { type: 'object' },
  projection: { type: 'object' },
  sort: { type: ['object', 'string'] },
  maxTimeMS: { type: 'number' },
  upsert: { type: 'boolean', default: false },
  returnOriginal: { type: 'boolean' },
  session: { type: ClientSession },
  fields: { overrideOnly: true },
  update: { overrideOnly: true },
  new: { overrideOnly: true },
  remove: { overrideOnly: true },
  serializeFunctions: { type: 'boolean' },
  checkKeys: { overrideOnly: true },
  readPreference: { overrideOnly: true },
  fsync: { type: 'number' }
};

const findOneAndUpdateSchema = {
  bypassDocumentValidation: { type: 'boolean' },
  collation: { type: 'object' },
  projection: { type: 'object' },
  sort: { type: ['object', 'string'] },
  maxTimeMS: { type: 'number' },
  upsert: { type: 'boolean', default: false },
  returnOriginal: { type: 'boolean' },
  session: { type: ClientSession },
  arrayFilters: { type: 'array' },
  fields: { overrideOnly: true },
  update: { overrideOnly: true },
  new: { overrideOnly: true },
  remove: { overrideOnly: true },
  serializeFunctions: { type: 'boolean' },
  checkKeys: { overrideOnly: true },
  readPreference: { overrideOnly: true },
  fsync: { type: 'number' }
};

const geoHaystackSearchSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  maxDistance: { type: 'number' },
  search: { type: 'object' },
  limit: { type: 'number' },
  session: { type: ClientSession },
  readConcern: { type: 'object' }
};

const indexesSchema = {
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'string', 'object'] },
  session: { type: ClientSession },
  full: { type: 'boolean', default: true }
};

const indexExistsSchema = {
  session: { type: ClientSession },
  full: { type: 'boolean', default: false }
};

const indexInformationSchema = {
  full: { type: 'boolean', default: false },
  session: { type: ClientSession }
};

const initializeOrderedBulkOpSchema = {
  bypassDocumentValidation: { type: 'boolean' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  promiseLibrary: { overrideOnly: true },
  ignoreUndefined: { type: 'boolean' }
};

const initializeUnorderedBulkOpSchema = {
  bypassDocumentValidation: { type: 'boolean' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  promiseLibrary: { overrideOnly: true },
  ignoreUndefined: { type: 'boolean' }
};

const insertManySchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  serializeFunctions: { type: 'boolean' },
  forceServerObjectId: { type: 'boolean' },
  bypassDocumentValidation: { type: 'boolean' },
  ordered: { type: 'boolean', default: true },
  session: { type: ClientSession },
  ignoreUndefined: { overrideOnly: true }
};

const insertOneSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  serializeFunctions: { type: 'boolean' },
  forceServerObjectId: { type: 'boolean' },
  bypassDocumentValidation: { type: 'boolean' },
  session: { type: ClientSession },
  ignoreUndefined: { type: 'boolean', overrideOnly: true }
};

const isCappedSchema = {
  session: { type: ClientSession }
};

const listIndexesSchema = {
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession },
  cursorFactory: { overrideOnly: true },
  promiseLibrary: { overrideOnly: true },
  optionsValidationLevel: { overrideOnly: true }
};

const mapReduceSchema = {
  collation: { type: 'object' },
  readPreference: { type: [ReadPreference, 'string', 'object'] },
  out: { type: ['string', 'object'], required: true },
  query: { type: 'object' },
  sort: { type: 'object' },
  limit: { type: 'number' },
  keeptemp: { type: 'boolean' },
  finalize: { type: ['function', 'string'] },
  scope: { type: 'object' },
  jsMode: { type: 'boolean' },
  verbose: { type: 'boolean' },
  bypassDocumentValidation: { type: 'boolean' },
  session: { type: ClientSession },
  readConcern: { type: 'object' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' }
};

const optionsSchema = {
  session: { type: ClientSession }
};

const parallelCollectionScanSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  batchSize: { type: 'number', default: 1000 },
  numCursors: { type: 'number', default: 1 },
  raw: { type: 'boolean', default: false },
  promiseLibrary: { overrideOnly: true },
  session: { overrideOnly: true },
  optionsValidationLevel: { overrideOnly: true },
  readConcern: { type: 'object' }
};

const reIndexSchema = {
  session: { type: ClientSession }
};

const renameSchema = {
  dropTarget: { type: 'boolean', default: false },
  readPreference: { type: [ReadPreference, 'string', 'object'], overrideOnly: true },
  session: { type: ClientSession }
};

const replaceOneSchema = {
  upsert: { type: 'boolean' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  bypassDocumentValidation: { type: 'boolean' },
  collation: { type: 'object' },
  ignoreUndefined: { type: 'boolean', overrideOnly: true },
  session: { type: ClientSession },
  multi: { overrideOnly: true }
};

const statsSchema = {
  readPreference: { type: [ReadPreference, 'string', 'object'] },
  scale: { type: 'number' },
  session: { type: ClientSession }
};

const updateManySchema = {
  upsert: { type: 'boolean' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  arrayFilters: { type: 'array' },
  bypassDocumentValidation: { type: 'boolean' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  ignoreUndefined: { type: 'boolean', overrideOnly: true },
  multi: { overrideOnly: true }
};

const updateOneSchema = {
  upsert: { type: 'boolean' },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  bypassDocumentValidation: { type: 'boolean' },
  arrayFilters: { type: 'array' },
  collation: { type: 'object' },
  ignoreUndefined: { type: 'boolean', overrideOnly: true },
  session: { type: ClientSession },
  multi: { overrideOnly: true }
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
  aggregateSchema,
  bulkWriteSchema,
  countDocumentsSchema,
  createIndexSchema,
  createIndexesSchema,
  deleteManySchema,
  deleteOneSchema,
  distinctSchema,
  dropSchema,
  dropIndexSchema,
  dropIndexesSchema,
  estimatedDocumentCountSchema,
  findSchema,
  findAndModifySchema,
  findAndRemoveSchema,
  findOneSchema,
  findOneAndDeleteSchema,
  findOneAndReplaceSchema,
  findOneAndUpdateSchema,
  geoHaystackSearchSchema,
  indexesSchema,
  indexExistsSchema,
  indexInformationSchema,
  initializeOrderedBulkOpSchema,
  initializeUnorderedBulkOpSchema,
  insertManySchema,
  insertOneSchema,
  isCappedSchema,
  listIndexesSchema,
  mapReduceSchema,
  optionsSchema,
  parallelCollectionScanSchema,
  reIndexSchema,
  renameSchema,
  replaceOneSchema,
  statsSchema,
  updateManySchema,
  updateOneSchema,
  watchSchema
};
