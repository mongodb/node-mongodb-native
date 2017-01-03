"use strict";

var Runner = require('integra').Runner
  , Cover = require('integra').Cover
  , RCover = require('integra').RCover
  , f = require('util').format
  , m = require('mongodb-version-manager')
  , path = require('path')
  , NodeVersionFilter = require('./filters/node_version_filter')
  , MongoDBVersionFilter = require('./filters/mongodb_version_filter')
  , MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
  , ES6PromisesSupportedFilter = require('./filters/es6_promises_supported_filter')
  , ES6GeneratorsSupportedFilter = require('./filters/es6_generators_supported_filter')
  , OSFilter = require('./filters/os_filter')
  , TravisFilter = require('./filters/travis_filter')
  , FileFilter = require('integra').FileFilter
  , TestNameFilter = require('integra').TestNameFilter
  , semver = require('semver');

var detector = require('gleak')();
var smokePlugin = require('./smoke_plugin.js');
var argv = require('optimist')
    .usage('Usage: $0 -t [target] -e [environment] -n [name] -f [filename] -r [smoke report file]')
    .demand(['t'])
    .argv;

// MongoDB Topology Manager
var ServerManager = require('mongodb-topology-manager').Server,
  ReplSetManager = require('mongodb-topology-manager').ReplSet,
  ShardingManager = require('./topology_test_definitions.js').Sharded;

// Skipping parameters
var startupOptions = {
    skipStartup: true
  , skipRestart: true
  , skipShutdown: true
  , skip: false
}

// Skipping parameters
var startupOptions = {
    skipStartup: false
  , skipRestart: false
  , skipShutdown: false
  , skip: false
}

// Skipping parameters
if(argv.s) {
  var startupOptions = {
      skipStartup: true
    , skipRestart: true
    , skipShutdown: true
    , skip: false
  }
}

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;
var mongo = require('..');
var Logger = mongo.Logger;

var clone = function(obj) {
  var copy = {};
  for(var name in obj) copy[name] = obj[name];
  return copy;
}

var Configuration = function(options) {
  options = options || {};
  var host = options.host || 'localhost';
  var port = options.port || 27017;
  var db = options.db || 'integration_tests';
  var url = options.url || "mongodb://%slocalhost:27017/" + db;
  var manager = options.manager;
  var skipStart = typeof options.skipStart == 'boolean' ? options.skipStart : false;
  var skipTermination = typeof options.skipTermination == 'boolean' ? options.skipTermination : false;
  var setName = options.setName || 'rs';
  var replicasetName = options.replicasetName || 'rs';

  // Write concerns
  var writeConcern = options.writeConcern || {w:1};
  var writeConcernMax = options.writeConcernMax || {w:1};

  // Default function
  var defaultFunction = function(host, port, options) {
    return new mongo.Server(host, port, options || {});
  };

  // Create a topology function
  var topology = options.topology || defaultFunction;

  return function(context) {
    return {
      start: function(callback) {
        var self = this;
        if(skipStart) return callback();

        manager.discover().then(function(result) {
          // Create string representation
          var currentVersion = result.version.join('.');
          // If we have a ReplSetManager and the version is >= 3.4.0
          if(semver.satisfies(currentVersion, ">=3.4.0")) {
            if(manager instanceof ReplSetManager) {
              manager.managers = manager.managers.map(function(manager) {
                manager.options.enableMajorityReadConcern = null;
                return manager;
              });
            }
          }

          // Purge the database
          manager.purge().then(function() {
            console.log("[purge the directories]");

            var Logger = require('mongodb-topology-manager').Logger;
            manager.start().then(function() {
              console.log("[started the topology]");
              var Logger = require('mongodb-topology-manager').Logger;
              // Logger.setLevel('info');
              // Create an instance
              new mongo.Db(self.db, topology(host, port)).open(function(err, db) {
                if(err) return callback(err);

                db.dropDatabase(function(err) {
                  db.close();
                  callback();
                });
              });
            }).catch(function(err) {
              console.log(err.stack);
            });
          }).catch(function(err) {
            console.log(err.stack);
          });
        }).catch(function(err) {
          console.log(err.stack);
        });
      },

      stop: function(callback) {
        // console.log("=================== STOP 0")
        if(skipTermination) return callback();
        // console.log("=================== STOP 1")
        // Stop the servers
        manager.stop(9).then(function() {
          // console.log("=================== STOP 1")
          callback();
        });
      },

      restart: function(options, callback) {
        // console.log("------------ restart 0")
        // console.log("=================== RESTART 0")
        if(typeof options == 'function') callback = options, options = {purge:true, kill:true};
        // console.log("=================== RESTART 1")
        if(skipTermination) return callback();
        // console.log("=================== RESTART 2")
        // console.log("------------ restart 1")

        // Stop the servers
        manager.restart().then(function() {
          // console.log("=================== RESTART 3")
          callback();
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
        if(options.newDbInstance) {
          return options.newDbInstance(dbOptions, serverOptions);
        }

        // Set up the options
        var keys = Object.keys(options);
        if(keys.indexOf('sslOnNormalPorts') != -1) serverOptions.ssl = true;

        // Fall back
        var port = serverOptions && serverOptions.port || options.port || 27017;
        var host = serverOptions && serverOptions.host || 'localhost';

        // Default topology
        var topology = mongo.Server;
        // If we have a specific topology
        if(options.topology) {
          topology = options.topology;
        }

        // Return a new db instance
        return new mongo.Db(db, new topology(host, port, serverOptions), dbOptions);
      },

      newDbInstanceWithDomainSocket: function(dbOptions, serverOptions) {
        // Override implementation
        if(options.newDbInstanceWithDomainSocket) return options.newDbInstanceWithDomainSocket(dbOptions, serverOptions);

        // Default topology
        var topology = mongo.Server;
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
          return new mongo.Db(db, topology(host, undefined, serverOptions), dbOptions);
        }

        // Normal socket connection
        return new mongo.Db(db, topology(host, serverOptions), dbOptions);
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
      database: db || options.db,
      require: mongo,
      port: port,
      host: host,
      setName: setName,
      db: db,
      manager: manager,
      replicasetName: replicasetName,
      writeConcern: function() { return clone(writeConcern) },
      writeConcernMax: function() { return clone(writeConcernMax) }
    }
  }
}

// Set up the runner
var runner = new Runner({
    // logLevel:'error'
    logLevel:'info'
  , runners: 1
  , failFast: true
});

var testFiles = [
  // Logging tests
    '/test/functional/logger_tests.js'

  // APM tests
  , '/test/functional/apm_tests.js'

  // Connection spec tests
  , '/test/functional/connection_string_spec_tests.js'

  // Replicaset read concern (make sure no illegal state due to teardown tests)
  , '/test/functional/readconcern_tests.js'

  // Promise tests
  , '/test/functional/promises_db_tests.js'
  , '/test/functional/promises_collection_tests.js'
  , '/test/functional/promises_cursor_tests.js'
  , '/test/functional/operation_promises_example_tests.js'
  , '/test/functional/byo_promises_tests.js'

  // Functionality tests
  , '/test/functional/mongo_client_tests.js'
  , '/test/functional/collection_tests.js'
  , '/test/functional/db_tests.js'
  , '/test/functional/cursor_tests.js'
  , '/test/functional/insert_tests.js'
  , '/test/functional/aggregation_tests.js'
  , '/test/functional/connection_tests.js'
  , '/test/functional/cursorstream_tests.js'
  , '/test/functional/custom_pk_tests.js'
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
  , '/test/functional/uri_tests.js'
  , '/test/functional/url_parser_tests.js'
  , '/test/functional/gridfs_tests.js'
  , '/test/functional/bulk_tests.js'
  , '/test/functional/operation_example_tests.js'
  , '/test/functional/crud_api_tests.js'
  , '/test/functional/document_validation_tests.js'
  , '/test/functional/ignore_undefined_tests.js'
  , '/test/functional/mongo_client_options_tests.js'
  , '/test/functional/decimal128_tests.js'
  , '/test/functional/find_and_modify_tests.js'
  , '/test/functional/hang_tests.js',
  , '/test/functional/disconnect_handler_tests.js',
  , '/test/functional/promote_values_tests.js',
  , '/test/functional/promote_buffers_tests.js',

  // Replicaset tests
  , '/test/functional/replset_read_preference_tests.js'
  , '/test/functional/replset_operations_tests.js'
  , '/test/functional/replset_failover_tests.js'
  , '/test/functional/replset_connection_tests.js'

  // Sharding tests
  , '/test/functional/sharding_failover_tests.js'
  , '/test/functional/sharding_connection_tests.js'
  , '/test/functional/sharding_read_preference_tests.js'

  // SSL tests
  , '/test/functional/ssl_mongoclient_tests.js'
  , '/test/functional/ssl_validation_tests.js'
  , '/test/functional/ssl_x509_connect_tests.js'
  , '/test/functional/sni_tests.js'

  // SCRAM tests
  , '/test/functional/scram_tests.js'

  // LDAP Tests
  , '/test/functional/ldap_tests.js'

  // Kerberos Tests
  , '/test/functional/kerberos_tests.js'

  // Authentication Tests
  , '/test/functional/authentication_tests.js'

  // GridFS
  , '/test/functional/gridfs_stream_tests.js'

  // Reconnection tests
  , '/test/functional/reconnect_tests.js',

  // Bug tests
  , '/test/functional/jira_bug_tests.js',

  // Domain tests
  , '/test/functional/domain_tests.js'
]

// Check if we support es6 generators
try {
  eval("(function *(){})");
  // Generator tests
  testFiles.push('/test/functional/operation_generators_example_tests.js');
  // Mock tests
  testFiles.push('/test/functional/command_write_concern_tests.js');
  testFiles.push('/test/functional/replicaset_mock_tests.js');
  testFiles.push('/test/functional/collations_tests.js');
  testFiles.push('/test/functional/max_staleness_tests.js');
  testFiles.push('/test/functional/buffering_proxy_tests.js');
  testFiles.push('/test/functional/view_tests.js');
  testFiles.push('/test/functional/crud_spec_tests.js');
} catch(err) {}

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

// Filter by OS
runner.plugin(new OSFilter());
// Add a Node version plugin
runner.plugin(new NodeVersionFilter(startupOptions));
// Add a MongoDB version plugin
runner.plugin(new MongoDBVersionFilter(startupOptions));
// Add a Topology filter plugin
runner.plugin(new MongoDBTopologyFilter(startupOptions));
// Add a Filter allowing us to specify that a function requires Promises
runner.plugin(new ES6PromisesSupportedFilter());
// Add a Filter allowing us to validate if generators are available
runner.plugin(new ES6GeneratorsSupportedFilter());

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
// Logger.filter('class', ['ReplSet']);

// We want to export a smoke.py style json file
if(argv.r) {
  console.log("Writing smoke output to " + argv.r);
  smokePlugin.attachToRunner(runner, argv.r);
}

// Are we running a functional test
if(argv.t == 'functional') {
  // Contain the config
  var config = null;

  //
  // Execute the final code
  var executeTestSuite = function(_config) {
    // If we have a test we are filtering by
    if(argv.f) {
      runner.plugin(new FileFilter(argv.f));
    }

    if(argv.n) {
      runner.plugin(new TestNameFilter(argv.n));
    }

    // Add travis filter
    runner.plugin(new TravisFilter());

    // Skip startup
    if(startupOptions.skipStartup) {
      return runner.run(Configuration(_config));
    }

    // Skip the version download and use local mongod in PATH
    if(argv.l) {
      return runner.run(Configuration(_config));
    }

    // console.log("!!!!!!!!!!! RUN 0")
    // Kill any running MongoDB processes and
    // `install $MONGODB_VERSION` || `use existing installation` || `install stable`
    m(function(err){
      // console.log("!!!!!!!!!!! RUN 1")
      if(err) return console.error(err) && process.exit(1);

      m.current(function(err, version){
        // console.log("!!!!!!!!!!! RUN 2")
        if(err) return console.error(err) && process.exit(1);
        console.log('Running tests against MongoDB version `%s`', version);
        // Run the configuration
        runner.run(Configuration(_config));
      });
    });
  }

  //
  // Replicaset configuration
  if(argv.e == 'replicaset') {
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    // Establish the server version
    new ServerManager('mongod').discover().then(function(r) {
      // The individual nodes
      var nodes = [{
        tags: {loc: 'ny'},
        // mongod process options
        options: {
          bind_ip: 'localhost',
          port: 31000,
          dbpath: f('%s/../db/31000', __dirname),
          setParameter: ['enableTestCommands=1']
        }
      }, {
        tags: {loc: 'sf'},
        options: {
          bind_ip: 'localhost',
          port: 31001,
          dbpath: f('%s/../db/31001', __dirname),
          setParameter: ['enableTestCommands=1']
        }
      }, {
        tags: {loc: 'sf'},
        options: {
          bind_ip: 'localhost',
          port: 31002,
          dbpath: f('%s/../db/31002', __dirname),
          setParameter: ['enableTestCommands=1']
        }
      }, {
        tags: {loc: 'sf'},
        priority: 0,
        options: {
          bind_ip: 'localhost',
          port: 31003,
          dbpath: f('%s/../db/31003', __dirname),
          setParameter: ['enableTestCommands=1']
        }
      }, {
        arbiter: true,
        options: {
          bind_ip: 'localhost',
          port: 31004,
          dbpath: f('%s/../db/31004', __dirname),
          setParameter: ['enableTestCommands=1']
        }
      }];

      // Do we have 3.2
      if(r.version[0] == 3 && r.version[1] == 2) {
        nodes = nodes.map(function(x) {
          x.options.enableMajorityReadConcern = null;
          return x;
        });
      }

      // Test suite Configuration
      config = {
          host: 'localhost', port: 31000, setName: 'rs'
        , url: "mongodb://%slocalhost:31000/integration_tests?rs_name=rs"
        , writeConcernMax: {w: 'majority', wtimeout: 30000}
        , replicasetName: 'rs'
        , skipStart: startupOptions.skipStartup
        , skipTermination: startupOptions.skipShutdown
        , topology: function(host, port, serverOptions) {
            host = host || 'localhost'; port = port || 31000;
            serverOptions = clone(serverOptions);
            serverOptions.rs_name = 'rs';
            serverOptions.poolSize = 1;
            serverOptions.autoReconnect = false;
            return new mongo.ReplSet([
              new mongo.Server(host, port, serverOptions)
            ], serverOptions);
          }
        , manager: new ReplSetManager('mongod', nodes, {
          replSet: 'rs'
        })
      }

      // Execute test suite
      executeTestSuite(config);
    });
  }

  //
  // Sharded configuration
  if(argv.e == 'sharded') {
    //
    // Sharded
    config = {
        host: 'localhost'
      , port: 51000
      , url: "mongodb://%slocalhost:51000/integration_tests"
      , writeConcernMax: {w: 'majority', wtimeout: 30000}
      , skipStart: startupOptions.skipStartup
      , skipTermination: startupOptions.skipShutdown
      , topology: function(host, port, options) {
        var options = options || {};
        options.autoReconnect = false;

        return new mongo.Mongos([
          new mongo.Server(host, port, options)
        ], options);
      }, manager: new ShardingManager({})
    }

    executeTestSuite(config);
  }

  //
  // SSL configuration
  if(argv.e == 'ssl') {
    // Create ssl server
    config = {
        sslOnNormalPorts: null
      , fork:null
      , sslPEMKeyFile: __dirname + "/functional/ssl/server.pem"
      , url: "mongodb://%slocalhost:27017/integration_tests?ssl=true&sslValidate=false"
      , topology: function(host, port, serverOptions) {
        host = host || 'localhost';
        port = port || 27017;
        serverOptions = clone(serverOptions);
        serverOptions.poolSize = 1;
        serverOptions.ssl = true;
        serverOptions.sslValidate = false;
        return new mongo.Server(host, port, serverOptions);
      }, manager: new ServerManager('mongod', {
        dbpath: path.join(path.resolve('db'), f("data-%d", 27017)),
        sslOnNormalPorts: null,
        sslPEMKeyFile: __dirname + "/functional/ssl/server.pem",
        setParameter: ['enableTestCommands=1']
      })
    }

    executeTestSuite(config);
  }

  //
  // SSL configuration
  if(argv.e == 'scram') {
    // Create ssl server
    config = {
        url: "mongodb://%slocalhost:27017/integration_tests"
      , topology: function(host, port, serverOptions) {
        host = host || 'localhost';
        port = port || 27017;
        serverOptions = clone(serverOptions);
        serverOptions.poolSize = 1;
        return new mongo.Server(host, port, serverOptions);
      }, manager: new ServerManager('mongod', {
        dbpath: path.join(path.resolve('db'), f("data-%d", 27017)),
        auth:null
      })
    }

    executeTestSuite(config);
  }

  //
  // Authentication Configuration
  if(argv.e == 'auth') {
    // Create ssl server
    config = {
        url: "mongodb://%slocalhost:27017/integration_tests"
      , topology: function(host, port, serverOptions) {
        host = host || 'localhost';
        port = port || 27017;
        serverOptions = clone(serverOptions);
        serverOptions.poolSize = 1;
        return new mongo.Server(host, port, serverOptions);
      }, manager: new ServerManager('mongod', {
        dbpath: path.join(path.resolve('db'), f("data-%d", 27017)),
        auth:null
      })
    }

    executeTestSuite(config);
  }

  //
  // Single server
  if(!argv.e || (argv.e == 'kerberos' || argv.e == 'ldap' || argv.e == 'sni')) {
    config = {
        host: 'localhost'
      , port: 27017
      , skipStart: startupOptions.skipStartup
      , skipTermination: startupOptions.skipShutdown
      , manager: new ServerManager('mongod', {
          dbpath: path.join(path.resolve('db'), f("data-%d", 27017)),
          setParameter: ['enableTestCommands=1']
      })
    }

    executeTestSuite(config);
  }
}
