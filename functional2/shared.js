function executeCommand(configuration, db, cmd, options, cb) {
  var Pool = require('../../../lib2/connection/pool')
    , MongoError = require('../../../lib2/error')
    , bson = require('bson').BSONPure.BSON
    , Query = require('../../../lib2/connection/commands').Query;

  // Optional options
  if(typeof options == 'function') cb = options, options = {};
  // Set the default options object if none passed in
  options = options || {};

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query.toBin(), {}, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);
      // Return the result
      cb(null, result.result);
    });
  });

  pool.connect.apply(pool, options.auth);
}

function locateAuthMethod(configuration, cb) {
  var Pool = require('../../../lib2/connection/pool')
    , MongoError = require('../../../lib2/error')
    , bson = require('bson').BSONPure.BSON
    , Query = require('../../../lib2/connection/commands').Query;

  // Set up operations
  var db = 'admin';
  var cmd = {ismaster:true}

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query.toBin(), {}, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);

      // Establish the type of auth method
      if(!result.result.maxWireVersion || result.result.maxWireVersion == 2) {
        cb(null, 'mongocr');
      } else {
        cb(null, 'scram-sha-1');
      }
    });
  });

  pool.connect.apply(pool);
}

module.exports.executeCommand = executeCommand;
module.exports.locateAuthMethod = locateAuthMethod;
