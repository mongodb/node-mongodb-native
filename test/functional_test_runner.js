var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , f = require('util').format
  , path = require('path')
  , NodeVersionFilter = require('./filters/node_version_filter')
  , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , TravisFilter = require('./filters/travis_filter')
  , FileFilter = require('integra').FileFilter
  , TestNameFilter = require('integra').TestNameFilter
  , ServerManager = require('./tools/server_manager')
  , ReplSetManager = require('./tools/replset_manager')
  , ShardingManager = require('./tools/sharding_manager')
  , LegacySupport = require('../lib/legacy/legacy_support');

var smokePlugin = require('./tools/smoke_plugin.js');
var argv = require('optimist')
    .usage('Usage: $0 -t [target] -e [environment] -n [name] -f [filename] -r [smoke report file]')
    .demand(['t'])
    .argv;

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;
var Logger = require('../lib/connection/logger');

var Configuration = function(options) {
  options = options || {};
  var host = options.host || 'localhost';
  var port = options.port || 27017;
  var db = options.db || 'integration_tests';
  var mongo = null;
  var manager = options.manager;
  var skipStart = typeof options.skipStart == 'boolean' ? options.skipStart : false;
  var skipTermination = typeof options.skipTermination == 'boolean' ? options.skipTermination : false;
  var setName = options.setName || 'rs';

  // Create a topology function
  var topology = options.topology || function(self, _mongo) {
    return new _mongo.Server({
        host: self.host
      , port: self.port
      , fallback: new LegacySupport()
    });
  }

  return function(context) {
    mongo = require('..');

    return {    
      start: function(callback) {
        var self = this;
        // if(skipStart) return callback();
        // // Start the db
        // manager.start({purge:true, signal: -9}, function(err) {
        //   var server = topology(this, mongo);
        //   // Set up connect
        //   server.once('connect', function() {
        //     // Drop the database
        //     server.command(f("%s.$cmd", self.db), {dropDatabase: 1}, function(err, r) {
        //       server.destroy();
              callback();
        //     });
        //   });
          
        //   // Connect
        //   server.connect();
        // });
      },

      stop: function(callback) {
        // if(skipTermination) return callback();
        // manager.stop({signal: -15}, function() {
          callback();
        // });        
      },

      restart: function(callback) {
        manager.restart({purge:true, kill:true}, function() {
          setTimeout(function() {
            callback();
          }, 1000);          
        });
      },

      setup: function(callback) {
        callback();
      },

      teardown: function(callback) {
        callback();
      },

      newTopology: function(options, callback) {
        if(typeof options == 'function') {
          callback = options;
          options = {};
        }

        callback(null, topology(this, mongo));
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
      setName: setName,
      db: db,
      manager: manager,
      writeConcern: function() { return {w: 1} }
    }
  }
}

// Set up the runner
var runner = new Runner({
    logLevel:'debug'
  , runners: 1
  , failFast: true
});

var testFiles =[
    '/test/tests/functional/server_tests.js'
  , '/test/tests/functional/operations_tests.js'
  , '/test/tests/functional/replset_failover_tests.js'
  , '/test/tests/functional/basic_auth_tests.js'
  , '/test/tests/functional/extend_pick_strategy_tests.js'
  , '/test/tests/functional/mongos_tests.js'
  , '/test/tests/functional/extend_cursor_tests.js'
  , '/test/tests/functional/legacy_support_tests.js'
  , '/test/tests/functional/pool_tests.js'
  , '/test/tests/functional/connection_tests.js'
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
// Add a MongoDB version plugin
runner.plugin(new MongoDBVersionFilter());
// Add a Topology filter plugin
runner.plugin(new MongoDBTopologyFilter());

// Exit when done
runner.on('exit', function(errors, results) {
  process.exit(0)
});

// Set Logger level for driver
// Logger.setLevel('info');
Logger.setLevel('error');
// Logger.setLevel('debug');
// Logger.filter('class', ['ReplSet', 'Server', 'Connection']);
// Logger.filter('class', ['ReplSet', 'Server', 'Pool', 'Connection']);
// Logger.filter('class', ['ReplSet', 'Server', 'Cursor']);
//Logger.filter('class', ['Mongos', 'Server']);
//Logger.filter('class', ['Mongos', 'Server']);
// Logger.filter('class', ['Mongos']);
Logger.filter('class', ['ReplSet']);

// We want to export a smoke.py style json file
if(argv.r) {
  console.log("Writing smoke output to " + argv.r);
  smokePlugin.attachToRunner(runner, argv.r);
}

// Are we running a functional test
if(argv.t == 'functional') {
  // 
  // Single server
  var config = {
      host: 'localhost'
    , port: 27017
    , skipStart: false
    , skipTermination: false
    , manager: new ServerManager({
        dbpath: path.join(path.resolve('db'), f("data-%d", 27017))
      , logpath: path.join(path.resolve('db'), f("data-%d.log", 27017))
    })
  }

  if(argv.e == 'replicaset') {
    // 
    // Replicaset
    config = {
        host: 'localhost'
      , port: 31000
      , setName: 'rs'
      // , skipStart: true
      , skipTermination: true
      , topology: function(self, _mongo) {
        return new _mongo.ReplSet([{
            host: 'localhost'
          , port: 31000
        }], { setName: 'rs' });
      }  
      , manager: new ReplSetManager({
          dbpath: path.join(path.resolve('db'))
        , logpath: path.join(path.resolve('db'))
        , tags: [{loc: "ny"}, {loc: "sf"}, {loc: "sf"}]
      })
    }
  } else if(argv.e == 'sharded') {
    // 
    // Sharded
    config = {
        host: 'localhost'
      , port: 50000
      // , skipStart: true
      // , skipTermination: true
      , topology: function(self, _mongo) {
        return new _mongo.Mongos([{
            host: 'localhost'
          , port: 50000
        }]);
      }, manager: new ShardingManager({
          dbpath: path.join(path.resolve('db'))
        , logpath: path.join(path.resolve('db'))
        , tags: [{loc: "ny"}, {loc: "sf"}, {loc: "sf"}]
        , mongosStartPort: 50000
        , replsetStartPort: 31000
      })
    }
  }

  // If we have a test we are filtering by
  if(argv.f) {
    runner.plugin(new FileFilter(argv.f));
  }

  if(argv.n) {
    runner.plugin(new TestNameFilter(argv.n));
  }

  // Add travis filter
  runner.plugin(new TravisFilter());

  // Run the configuration
  runner.run(Configuration(config));
}


// // Run the tests
// runner.run(Configuration(config));





