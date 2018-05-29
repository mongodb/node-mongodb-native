'use strict';

const executeCommand = require('./db_execute_commands').executeCommand;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;

function dropDatabase(self, cmd, options, callback) {
  executeCommand(self, cmd, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}

module.exports = dropDatabase;
