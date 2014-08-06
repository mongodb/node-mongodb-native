var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , FileFilter = require('integra').FileFilter
  , NodeVersionFilter = require('./filters/node_version_filter')
  , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , TravisFilter = require('./filters/travis_filter')
  , FileFilter = require('integra').FileFilter
  , TestNameFilter = require('integra').TestNameFilter
  , path = require('path')
  , f = require('util').format;

var smokePlugin = require('./smoke_plugin.js');
// console.log(argv._);
var argv = require('optimist')
    .usage('Usage: $0 -t [target] -e [environment] -n [name] -f [filename] -r [smoke report file]')
    .demand(['t'])
    .argv;

var shallowClone = function(obj) {
  var copy = {};
  for(var name in obj) copy[name] = obj[name];
  return copy;
}

/**
 * Standalone MongoDB Configuration
 */
var createConfiguration = function(options) {  
  options = options || {};

  // Create the configuration
  var Configuration = function(context) {
    var mongo = require('../');
    var Db = mongo.Db;
    var Server = mongo.Server;
    var ServerManager = require('mongodb-core').ServerManager;
    var database = "integration_tests";
    var url = options.url || "mongodb://%slocalhost:27017/" + database;
    var port = options.port || 27017;
    var host = options.host || 'localhost';
    var replicasetName = options.replicasetName || 'rs';
    var writeConcern = options.writeConcern || {w:1};
    var writeConcernMax = options.writeConcernMax || {w:1};
    
    // Override manager or use default
    var manager = options.manager ? options.manager() : new ServerManager({
      journal:false
    });  

    // clone
    var clone = function(o) {
      var p = {}; for(var name in o) p[name] = o[name];
      return p;
    }

    // return configuration
    return {
      manager: manager,
      replicasetName: replicasetName,

      start: function(callback) {
        manager.start({purge:true, signal:-9}, function(err) {
          // console.log("+++++++++++++++++++++++++++++++++++++++++ STARTED")
          // console.dir(err)
          if(err) throw err;
          callback();
        });
      },

      stop: function(callback) {
        // console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 0")
        manager.stop({signal: -15}, function() {
        // console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 1")
          callback();
        });        
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

      newDbInstance: function(dbOptions, serverOptions) {
        // Override implementation
        if(options.newDbInstance) return options.newDbInstance(dbOptions, serverOptions);

        // Fall back
        var port = serverOptions && serverOptions.port || options.port || 27017;
        var host = serverOptions && serverOptions.host || 'localhost';
        if(dbOptions.w == null
            && dbOptions.fsync == null
            && dbOptions.wtimeout == null
            && dbOptions.j == null) dbOptions.w = 1;

        // Default topology
        var topology = Server;
        // If we have a specific topology
        if(options.topology) {
          topology = options.topology;
        }

        // Return a new db instance
        return new Db(database, new topology(host, port, serverOptions), dbOptions);
      },

      newDbInstanceWithDomainSocket: function(dbOptions, serverOptions) {
        // Override implementation
        if(options.newDbInstanceWithDomainSocket) return options.newDbInstanceWithDomainSocket(dbOptions, serverOptions);

        // If we have a topology
        if(options.topology) {
          return topology(null, null, serverOptions);
        }

        // Fall back
        var host = serverOptions && serverOptions.host || "/tmp/mongodb-27017.sock";

        // If we explicitly testing undefined port behavior
        if(serverOptions && serverOptions.port == 'undefined') {
          return new Db('integration_tests', new Server(host, undefined, serverOptions), dbOptions);
        }

        // Normal socket connection
        return new Db('integration_tests', new Server(host, serverOptions), dbOptions);
      },

      url: function(username, password) {
        // Fall back
        var auth = "";

        if(username && password) {
          auth = f("%s:%s@", username, password);
        }

        return f(url, auth);
      },

      // Additional parameters needed
      require: mongo,
      database: database || options.database,
      nativeParser: true,
      port: port,
      host: host,
      writeConcern: function() { return clone(writeConcern) },
      writeConcernMax: function() { return clone(writeConcernMax) }
    }
  }

  return Configuration;
}

// Set up the runner
var runner = new Runner({
    logLevel:'info'
  , runners: 1
  , failFast: true
});

var testFiles =[
  //   '/test/functional/mongo_client_tests.js'
  // , '/test/functional/collection_tests.js'
  // , '/test/functional/db_tests.js'
  // , '/test/functional/cursor_tests.js'
  // , '/test/functional/insert_tests.js'
  // , '/test/functional/aggregation_tests.js'
  // , '/test/functional/admin_tests.js'
  // , '/test/functional/connection_tests.js'
  // , '/test/functional/cursorstream_tests.js'
  // , '/test/functional/custom_pk_tests.js'
  // , '/test/functional/domain_tests.js'
  // , '/test/functional/error_tests.js'
  // , '/test/functional/find_tests.js'
  // , '/test/functional/geo_tests.js'
  // , '/test/functional/index_tests.js'
  // , '/test/functional/mapreduce_tests.js'
  // , '/test/functional/maxtimems_tests.js'
  // , '/test/functional/multiple_db_tests.js'
  // , '/test/functional/object_id_tests.js'
  // , '/test/functional/raw_tests.js'
  // , '/test/functional/readpreference_tests.js'
  // , '/test/functional/remove_tests.js'
  // , '/test/functional/unicode_tests.js'
  // , '/test/functional/uri_tests.js'
  // , '/test/functional/url_parser_tests.js'
  // , '/test/functional/gridfs_tests.js'
  // , '/test/functional/bulk_tests.js'

  // Replicaset tests
  , '/test/functional/replset_failover_tests.js'
  , '/test/functional/replset_connection_tests.js'
  , '/test/functional/replset_operations_tests.js'
  , '/test/functional/replset_read_preference_tests.js'
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

// We want to export a smoke.py style json file
if(argv.r) {
  console.log("Writing smoke output to " + argv.r);
  smokePlugin.attachToRunner(runner, argv.r);
}

// Are we running a functional test
if(argv.t == 'functional') {
  var config = createConfiguration();

  if(argv.e == 'replicaset') {
    config = createConfiguration({
        port: 31000,
        host: 'localhost',
        url: "mongodb://%slocalhost:31000/integration_tests?rs_name=rs",
        writeConcernMax: {w: 'majority', wtimeout: 5000},
        replicasetName: 'rs',
        
        topology: function(host, port, serverOptions) {
          var m = require('../');
          host = host || 'locahost'; port = port || 31000;
          serverOptions = shallowClone(serverOptions);
          serverOptions.rs_name = 'rs';
          serverOptions.poolSize = 1;
          return new m.ReplSet([new m.Server(host, port)], serverOptions);
        }, 
        
        manager: function() {
          var ReplSetManager = require('mongodb-core').ReplSetManager;
          // Return manager
          return new ReplSetManager({
              dbpath: path.join(path.resolve('db'))
            , logpath: path.join(path.resolve('db'))
            , arbiters: 1
            , tags: [{loc: "ny"}, {loc: "sf"}, {loc: "sf"}]
            , replSet: 'rs', startPort: 31000
          });
        },
    });
  } else if(argv.e == 'sharded') {
    config = createConfiguration({
        port: 50000,
        url: "mongodb://%slocalhost:50000/integration_tests",
        writeConcernMax: {w: 'majority', wtimeout: 5000},
        
        topology: function(host, port, serverOptions) {
          var m = require('../lib/mongodb');
          host = host || 'locahost'; port = port || 50000;
          return new m.Mongos([new m.Server(host, port, serverOptions)]);
        }, 

        manager: function() {
          var ShardingManager = require('mongodb-core').ShardingManager;
          return new ShardingManager({
              dbpath: path.join(path.resolve('db'))
            , logpath: path.join(path.resolve('db'))
            , tags: [{loc: "ny"}, {loc: "sf"}, {loc: "sf"}]
            , mongosStartPort: 50000
            , replsetStartPort: 31000
          });
        }
    })
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
  runner.run(config);
}





