'use strict';

const convertReadPreference = require('./db_helpers').convertReadPreference;
const debugOptions = require('../utils').debugOptions;
const f = require('util').format;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;

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

/**
 * The callback format for results
 * @callback Db~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */
function executeCommand(self, command, options, callback) {
  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Get the db name we are executing against
  var dbName = options.dbName || options.authdb || self.s.databaseName;

  // If we have a readPreference set
  if (options.readPreference == null && self.s.readPreference) {
    options.readPreference = self.s.readPreference;
  }

  // Convert the readPreference if its not a write
  if (options.readPreference) {
    options.readPreference = convertReadPreference(options.readPreference);
  } else {
    options.readPreference = ReadPreference.primary;
  }

  // Debug information
  if (self.s.logger.isDebug())
    self.s.logger.debug(
      f(
        'executing command %s against %s with options [%s]',
        JSON.stringify(command),
        f('%s.$cmd', dbName),
        JSON.stringify(debugOptions(debugFields, options))
      )
    );

  // Execute command
  self.s.topology.command(f('%s.$cmd', dbName), command, options, function(err, result) {
    if (err) return handleCallback(callback, err);
    if (options.full) return handleCallback(callback, null, result);
    handleCallback(callback, null, result.result);
  });
}

function executeDbAdminCommand(self, selector, options, callback) {
  self.s.topology.command('admin.$cmd', selector, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.result);
  });
}

exports.executeCommand = executeCommand;
exports.executeDbAdminCommand = executeDbAdminCommand;
