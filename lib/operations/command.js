'use strict';

const OperationBase = require('./operation').OperationBase;
const debugOptions = require('../utils').debugOptions;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;
const resolveReadPreference = require('../utils').resolveReadPreference;
const MongoDBNamespace = require('../utils').MongoDBNamespace;

const debugFields = [
  'authSource',
  'w',
  'wtimeout',
  'j',
  'native_parser',
  'forceServerObjectId',
  'serializeFunctions',
  'raw',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'bufferMaxEntries',
  'numberOfRetries',
  'retryMiliSeconds',
  'readPreference',
  'pkFactory',
  'parentDb',
  'promiseLibrary',
  'noListener'
];

class CommandOperation extends OperationBase {
  constructor(db, command, options, collection) {
    super(options);

    this.db = db;
    this.command = command;

    if (collection) {
      this.collection = collection;
    }
  }

  execute(callback) {
    const db = this.db;
    const command = this.command;
    const options = this.options;
    let collection;
    if (this.collection) {
      collection = this.collection;
    }

    // Did the user destroy the topology
    if (db.serverConfig && db.serverConfig.isDestroyed())
      return callback(new MongoError('topology was destroyed'));

    // Get the db name we are executing against
    const dbName = options.dbName || options.authdb || db.databaseName;

    // Convert the readPreference if its not a write
    options.readPreference = resolveReadPreference(options, {
      collection,
      db,
      default: ReadPreference.primary
    });

    // Debug information
    if (db.s.logger.isDebug())
      db.s.logger.debug(
        `executing command ${JSON.stringify(
          command
        )} against ${dbName}.$cmd with options [${JSON.stringify(
          debugOptions(debugFields, options)
        )}]`
      );

    const namespace = new MongoDBNamespace(dbName, '$cmd');

    // Execute command
    db.s.topology.command(namespace, command, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      if (options.full) return handleCallback(callback, null, result);
      handleCallback(callback, null, result.result);
    });
  }
}

module.exports = CommandOperation;
