'use strict';

function executeCommand(configuration, db, cmd, options, cb) {
  var Pool = require('../../../lib/connection/pool'),
    f = require('util').format,
    bson = require('bson'),
    Query = require('../../../lib/connection/commands').Query;

  // Optional options
  if (typeof options == 'function') (cb = options), (options = {});
  // Set the default options object if none passed in
  options = options || {};

  // Alternative options
  var host = options.host || configuration.host;
  var port = options.port || configuration.port;

  // Attempt to connect
  var pool = new Pool({
    host: host,
    port: port,
    bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {
      numberToSkip: 0,
      numberToReturn: 1
    });
    _pool.write(
      query,
      {
        command: true
      },
      function(err, result) {
        if (err) console.log(err.stack);
        // Close the pool
        _pool.destroy();
        // If we have an error return
        if (err) return cb(err);
        // Return the result
        cb(null, result.result);
      }
    );
  });

  pool.connect.apply(pool, options.auth);
}

function locateAuthMethod(configuration, cb) {
  var Pool = require('../../../lib/connection/pool'),
    bson = require('bson'),
    f = require('util').format,
    Query = require('../../../lib/connection/commands').Query;

  // Set up operations
  var db = 'admin';
  var cmd = { ismaster: true };

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host,
    port: configuration.port,
    bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {
      numberToSkip: 0,
      numberToReturn: 1
    });
    _pool.write(
      query,
      {
        command: true
      },
      function(err, result) {
        if (err) console.log(err.stack);
        // Close the pool
        _pool.destroy();
        // If we have an error return
        if (err) return cb(err);

        // Establish the type of auth method
        if (!result.result.maxWireVersion || result.result.maxWireVersion == 2) {
          cb(null, 'mongocr');
        } else {
          cb(null, 'scram-sha-1');
        }
      }
    );
  });

  pool.connect.apply(pool);
}

module.exports.executeCommand = executeCommand;
module.exports.locateAuthMethod = locateAuthMethod;
