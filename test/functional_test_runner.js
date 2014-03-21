var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  // , NodeVersionFilter = require('./filters/node_version_filter')
  // , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  // , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , FileFilter = require('integra').FileFilter;

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;

var StandaloneConfiguration = function(context) {
  var mongo = require('../lib');

  return {    
    start: function(callback) {
      callback();
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






