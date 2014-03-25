var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , f = require('util').format
  , FileFilter = require('integra').FileFilter;

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;

var StandaloneConfiguration = function(context) {
  var mongo = require('../lib');
  // var bson = require('bvson')

  return {    
    start: function(callback) {
      var self = this;
      var server = new mongo.Server({
          host: this.host
        , port: this.port 
      });
      // Set up connect
      server.once('connect', function() {
        // Drop the database
        server.command(f("%s.$cmd", self.db), {dropDatabase: 1}, function(err, r) {
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

    // Additional parameters needed
    require: mongo,
    port: 27017,
    host: 'localhost',
    db: 'integration_tests',
    writeConcern: function() { return {w: 1} }
  }
}

// Set up the runner
var runner = new Runner({
    logLevel:'error'
  , runners: 1
  , failFast: true
});

var testFiles =[
    '/test/tests/functional/connection_tests.js'
  , '/test/tests/functional/pool_tests.js'
  , '/test/tests/functional/server_tests.js'
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

// // Add a Node version plugin
// runner.plugin(new NodeVersionFilter());
// // Add a MongoDB version plugin
// runner.plugin(new MongoDBVersionFilter());
// // Add a Topology filter plugin
// runner.plugin(new MongoDBTopologyFilter());

// Exit when done
runner.on('exit', function(errors, results) {
  process.exit(0)
});

// Run the tests
runner.run(StandaloneConfiguration);
// runner.run(ReplicasetConfiguration);
// runner.run(ShardingConfiguration);






