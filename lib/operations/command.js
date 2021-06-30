'use strict';

const Aspect = require('./operation').Aspect;
const OperationBase = require('./operation').OperationBase;
const applyWriteConcern = require('../utils').applyWriteConcern;
const debugOptions = require('../utils').debugOptions;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;
const MongoDBNamespace = require('../utils').MongoDBNamespace;
const extractCommand = require('../command_utils').extractCommand;

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
  'bsonRegExp',
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
  constructor(db, options, collection, command) {
    super(options);

    if (!this.hasAspect(Aspect.WRITE_OPERATION)) {
      if (collection != null) {
        this.options.readPreference = ReadPreference.resolve(collection, options);
      } else {
        this.options.readPreference = ReadPreference.resolve(db, options);
      }
    } else {
      if (collection != null) {
        applyWriteConcern(this.options, { db, coll: collection }, this.options);
      } else {
        applyWriteConcern(this.options, { db }, this.options);
      }
      this.options.readPreference = ReadPreference.primary;
    }

    this.db = db;

    if (command != null) {
      this.command = command;
    }

    if (collection != null) {
      this.collection = collection;
    }
  }

  _buildCommand() {
    if (this.command != null) {
      return this.command;
    }
  }

  execute(callback) {
    const db = this.db;
    const options = Object.assign({}, this.options);

    // Did the user destroy the topology
    if (db.serverConfig && db.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    let command;
    try {
      command = this._buildCommand();
    } catch (e) {
      return callback(e);
    }

    // Get the db name we are executing against
    const dbName = options.dbName || options.authdb || db.databaseName;

    // Convert the readPreference if its not a write
    if (this.hasAspect(Aspect.WRITE_OPERATION)) {
      if (options.writeConcern && (!options.session || !options.session.inTransaction())) {
        command.writeConcern = options.writeConcern;
      }
    }

    // Debug information
    if (db.s.logger.isDebug()) {
      const extractedCommand = extractCommand(command);
      db.s.logger.debug(
        `executing command ${JSON.stringify(
          extractedCommand.shouldRedact ? `${extractedCommand.name} details REDACTED` : command
        )} against ${dbName}.$cmd with options [${JSON.stringify(
          debugOptions(debugFields, options)
        )}]`
      );
    }

    const namespace =
      this.namespace != null ? this.namespace : new MongoDBNamespace(dbName, '$cmd');

    // Execute command
    db.s.topology.command(namespace, command, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      if (options.full) return handleCallback(callback, null, result);
      handleCallback(callback, null, result.result);
    });
  }
}

module.exports = CommandOperation;
