"use strict";

var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , FileFilter = require('integra').FileFilter
  , NodeVersionFilter = require('./filters/node_version_filter')
  , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , OSFilter = require('./filters/os_filter')
  , TravisFilter = require('./filters/travis_filter')
  , DisabledFilter = require('./filters/disabled_filter')
  , FileFilter = require('integra').FileFilter
  , TestNameFilter = require('integra').TestNameFilter
  , semver = require('semver')
  , path = require('path')
  , rimraf = require('rimraf')
  , fs = require('fs')  
  , f = require('util').format;

var detector = require('gleak')();
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

// Skipping parameters
var startupOptions = {
    skipStartup: false
  , skipRestart: false
  , skipShutdown: false
  , skip: false
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
    var ServerManager = require('mongodb-tools').ServerManager;
    var database = "integration_tests";
    var url = options.url || "mongodb://%slocalhost:27017/" + database;
    var port = options.port || 27017;
    var host = options.host || 'localhost';
    var replicasetName = options.replicasetName || 'rs';
    var writeConcern = options.writeConcern || {w:1};
    var writeConcernMax = options.writeConcernMax || {w:1};
    
    // Shallow clone the options
    var fOptions = shallowClone(options);
    options.journal = false;

    // Override manager or use default
    var manager = options.manager ? options.manager() : new ServerManager(fOptions);  

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
        if(startupOptions.skipStartup) return callback();
        manager.start({purge:true, signal:-9, kill:true}, function(err) {
          if(err) throw err;
          callback();
        });
      },

      stop: function(callback) {
        if(startupOptions.skipShutdown) return callback();
        manager.stop({signal: -9}, function() {

          // Print any global leaks
          detector.detect().forEach(function (name) {
            console.warn('found global leak: %s', name);
          });

          // Finish stop
          callback();
        });        
      },

      restart: function(options, callback) {
        if(typeof options == 'function') callback = options, options = {};
        if(startupOptions.skipRestart) return callback();
        var purge = typeof options.purge == 'boolean' ? options.purge : true;
        var kill = typeof options.kill == 'boolean' ? options.kill : true;
        manager.restart({purge:purge, kill:kill}, function() {
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
        serverOptions = serverOptions || {};
        // Override implementation
        if(options.newDbInstance) return options.newDbInstance(dbOptions, serverOptions);

        // Set up the options
        var keys = Object.keys(options);
        if(keys.indexOf('sslOnNormalPorts') != -1) serverOptions.ssl = true;

        // Fall back
        var port = serverOptions && serverOptions.port || options.port || 27017;
        var host = serverOptions && serverOptions.host || 'localhost';

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

        // Default topology
        var topology = Server;
        // If we have a specific topology
        if(options.topology) {
          topology = options.topology;
        }

        // Fall back
        var host = serverOptions && serverOptions.host || "/tmp/mongodb-27017.sock";

        // Set up the options
        var keys = Object.keys(options);
        if(keys.indexOf('sslOnNormalPorts') != -1) serverOptions.ssl = true;
        // If we explicitly testing undefined port behavior
        if(serverOptions && serverOptions.port == 'undefined') {
          return new Db('integration_tests', topology(host, undefined, serverOptions), dbOptions);
        }

        // Normal socket connection
        return new Db('integration_tests', topology(host, serverOptions), dbOptions);
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
    // logLevel:'debug'
    runners: 1
  , failFast: true
});

var testFiles =[
  // Functional Tests
    '/test/functional/url_parser_tests.js'
  , '/test/functional/uri_tests.js'
  , '/test/functional/mongo_client_tests.js'
  , '/test/functional/collection_tests.js'
  , '/test/functional/db_tests.js'
  , '/test/functional/cursor_tests.js'
  , '/test/functional/insert_tests.js'
  , '/test/functional/aggregation_tests.js'
  , '/test/functional/admin_tests.js'
  , '/test/functional/connection_tests.js'
  , '/test/functional/cursorstream_tests.js'
  , '/test/functional/custom_pk_tests.js'
  , '/test/functional/domain_tests.js'
  , '/test/functional/error_tests.js'
  , '/test/functional/find_tests.js'
  , '/test/functional/index_tests.js'
  , '/test/functional/mapreduce_tests.js'
  , '/test/functional/maxtimems_tests.js'
  , '/test/functional/multiple_db_tests.js'
  , '/test/functional/object_id_tests.js'
  , '/test/functional/raw_tests.js'
  , '/test/functional/readpreference_tests.js'
  , '/test/functional/remove_tests.js'
  , '/test/functional/unicode_tests.js'
  , '/test/functional/gridfs_tests.js'
  , '/test/functional/bulk_tests.js'
  , '/test/functional/operation_example_tests.js'

  // Replicaset tests
  , '/test/functional/replset_read_preference_tests.js'
  , '/test/functional/replset_operations_tests.js'
  , '/test/functional/replset_connection_tests.js'
  , '/test/functional/replset_failover_tests.js'

  // Sharding tests
  , '/test/functional/sharding_failover_tests.js'
  , '/test/functional/sharding_connection_tests.js'
  , '/test/functional/sharding_read_preference_tests.js'

  // SSL tests
  , '/test/functional/ssl_mongoclient_tests.js'
  , '/test/functional/ssl_validation_tests.js'
  , '/test/functional/ssl_x509_connect_tests.js'

  // SCRAM tests
  , '/test/functional/scram_tests.js'

  // LDAP Tests
  , '/test/functional/ldap_tests.js'  

  // Kerberos Tests
  , '/test/functional/kerberos_tests.js'  

  // Authentication Tests
  , '/test/functional/authentication_tests.js'  
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
runner.plugin(new NodeVersionFilter(startupOptions));
// Add a MongoDB version plugin
runner.plugin(new MongoDBVersionFilter(startupOptions));
// Add a Topology filter plugin
runner.plugin(new MongoDBTopologyFilter(startupOptions));
// Add a OS filter plugin
runner.plugin(new OSFilter(startupOptions))
// Add a Disable filter plugin
runner.plugin(new DisabledFilter(startupOptions))

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
          host = host || 'localhost'; port = port || 31000;
          serverOptions = shallowClone(serverOptions);
          serverOptions.rs_name = 'rs';
          serverOptions.poolSize = 1;
          return new m.ReplSet([new m.Server(host, port)], serverOptions);
        }, 
        
        manager: function() {
          var ReplSetManager = require('mongodb-tools').ReplSetManager;
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
        host: 'localhost',
        url: "mongodb://%slocalhost:50000/integration_tests",
        writeConcernMax: {w: 'majority', wtimeout: 5000},
        
        topology: function(host, port, serverOptions) {
          var m = require('../');
          host = host || 'localhost'; port = port || 50000;
          serverOptions = shallowClone(serverOptions);
          serverOptions.poolSize = 1;
          return new m.Mongos([new m.Server(host, port, serverOptions)]);
        }, 

        manager: function() {
          var ShardingManager = require('mongodb-tools').ShardingManager;
          return new ShardingManager({
              dbpath: path.join(path.resolve('db'))
            , logpath: path.join(path.resolve('db'))
            , tags: [{loc: "ny"}, {loc: "sf"}, {loc: "sf"}]
            , mongosStartPort: 50000
            , replsetStartPort: 31000
          });
        }
    });
  } else if(argv.e == 'ssl') {
    // Create ssl server
    config = createConfiguration({
        sslOnNormalPorts: null
      , fork:null
      , sslPEMKeyFile: __dirname + "/functional/ssl/server.pem"
      , url: "mongodb://%slocalhost:27017/integration_tests?ssl=true"
      
      , topology: function(host, port, serverOptions) {
        var m = require('../');
        host = host || 'localhost'; port = port || 27017;
        serverOptions = shallowClone(serverOptions);
        serverOptions.poolSize = 1;
        serverOptions.ssl = true;
        return new m.Server(host, port, serverOptions);
      }, 
    });
  } else if(argv.e == 'heap') {
    // Create single server instance running heap storage engine
    config = createConfiguration({
        manager: function() {
          var ServerManager = require('mongodb-tools').ServerManager;
          // Return manager
          return new ServerManager({
              host: 'localhost'
            , port: 27017
            , storageEngine: 'heap1'
          });
        },
    });
  } else if(argv.e == 'wiredtiger') {
    // Create single server instance running heap storage engine
    config = createConfiguration({
        manager: function() {
          var ServerManager = require('mongodb-tools').ServerManager;
          // Return manager
          return new ServerManager({
              host: 'localhost'
            , port: 27017
            , storageEngine: 'wiredtiger'
          });
        },
    });
  } else if(argv.e == 'auth') {
    // Create ssl server
    config = createConfiguration({
      auth: null

      , topology: function(host, port, serverOptions) {
        var m = require('../');
        host = host || 'localhost'; port = port || 27017;
        serverOptions = shallowClone(serverOptions);
        serverOptions.poolSize = 1;
        return new m.Server(host, port, serverOptions);
      }, 
    });
  } else if(argv.e == 'ldap' || argv.e == 'kerberos') {
    startupOptions.skipStartup = true;
    startupOptions.skipRestart = true;
    startupOptions.skipShutdown = true;
    startupOptions.skip = true;
  } else if(argv.e == 'scram') {
    // Create ssl server
    config = createConfiguration({
        fork:null
      , auth: null
      , setParameter: 'authenticationMechanisms=SCRAM-SHA-1'

      , topology: function(host, port, serverOptions) {
        var m = require('../');
        host = host || 'localhost'; port = port || 27017;
        serverOptions = shallowClone(serverOptions);
        serverOptions.poolSize = 1;
        return new m.Server(host, port, serverOptions);
      }, 
    });    
  }

    // startupOptions.skipStartup = true;
    // startupOptions.skipRestart = true;
    // startupOptions.skipShutdown = true;
    // startupOptions.skip = true;

  // If we have a test we are filtering by
  if(argv.f) {
    runner.plugin(new FileFilter(argv.f));
  }

  if(argv.n) {
    runner.plugin(new TestNameFilter(argv.n));
  }

  // Add travis filter
  runner.plugin(new TravisFilter());

  // Remove db directories
  try {
    rimraf.sync('./data');
    rimraf.sync('./db');
  } catch(err) {
  }

  // Special handling for 0.8.x
  if(semver.satisfies(process.version, '<0.10.0')) return runner.run(config); 

  // 0.10.x or higher
  var m = require('mongodb-version-manager');
  // Kill any running MongoDB processes and
  // `install $MONGODB_VERSION` || `use existing installation` || `install stable`
  m(function(err){
    if(err) return console.error(err) && process.exit(1);

    m.current(function(err, version){
      if(err) return console.error(err) && process.exit(1);
      console.log('Running tests against MongoDB version `%s`', version);
      // Run the configuration
      runner.run(config);
    });
  });
}





