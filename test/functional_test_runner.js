var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , f = require('util').format
  , NodeVersionFilter = require('./filters/node_version_filter')
  // , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , FileFilter = require('integra').FileFilter;

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;
var Logger = require('../lib/connection/logger');

var StandaloneConfiguration = function(options) {
  options = options || {};
  var host = options.host || 'localhost';
  var port = options.port || 27017;
  var db = options.db || 'integration_tests';
  var mongo = null;

  // Create a topology function
  var topology = options.topology || function(self, _mongo) {
    return new _mongo.Server({
        host: self.host
      , port: self.port 
    });
  }

  return function(context) {
    mongo = require('../lib');

    return {    
      start: function(callback) {
        var self = this;
        var server = topology(this, mongo);
        
        // Set up connect
        server.once('connect', function() {
          // Drop the database
          server.command(f("%s.$cmd", self.db), {dropDatabase: 1}, function(err, r) {
            server.destroy();
            callback();
          });
        });
        
        // Connect
        server.connect();
      },

      shutdown: function(callback) {
        callback();
      },

      restart: function(callback) {
        callback();
      },

      setup: function(callback) {
        callback();
      },

      teardown: function(callback) {
        callback();
      },

      newConnection: function(options, callback) {
        if(typeof options == 'function') {
          callback = options;
          options = {};
        }

        var server = topology(this, mongo);
        // Set up connect
        server.once('connect', function() {
          callback(null, server);
        });

        // Connect
        server.connect();
      },

      // Additional parameters needed
      require: mongo,
      port: port,
      host: host,
      db: db,
      writeConcern: function() { return {w: 1} }
    }
  }
}

// Set up the runner
var runner = new Runner({
    logLevel:'error'
  , runners: 1
  , failFast: true
});

var testFiles =[
  //   '/test/tests/functional/connection_tests.js'
  // , '/test/tests/functional/pool_tests.js'
  // , '/test/tests/functional/server_tests.js'
  // , '/test/tests/functional/replset_tests.js'
  // , '/test/tests/functional/basic_auth_tests.js'
  , '/test/tests/functional/extend_pick_strategy_tests.js'
]

// Add all the tests to run
testFiles.forEach(function(t) {
  if(t != "") runner.add(t);
});

// // Add the Coverage plugin
// runner.plugin(new Cover({
//  logLevel: "info"
//  , filters: [
//      /_tests.js/
//    , "js-bson"
//    , "/tests/"
//    , "/tools/"
//  ]
// }));

// // Add the RCoverage plugin
// runner.plugin(new RCover({
//    logLevel: "info"
//  , filters: [
//      /_tests.js/
//    , "js-bson"
//    , "/tests/"
//    , "/tools/"
//  ]
// }));

// Add a Node version plugin
runner.plugin(new NodeVersionFilter());
// // Add a MongoDB version plugin
// runner.plugin(new MongoDBVersionFilter());
// Add a Topology filter plugin
runner.plugin(new MongoDBTopologyFilter());

// Exit when done
runner.on('exit', function(errors, results) {
  process.exit(0)
});

// Set Logger level for driver
Logger.setLevel('debug');
// Logger.filter('class', ['ReplSet', 'Server', 'Connection']);
// Logger.filter('class', ['Connection']);
Logger.filter('class', ['ReplSet']);

// Run the tests
runner.run(StandaloneConfiguration({
    host: 'localhost'
  // , port: 27017
  , port: 31000
  , topology: function(self, _mongo) {
    return new _mongo.ReplSet([{
        host: self.host
      , port: self.port 
    }]);
  }
}));





