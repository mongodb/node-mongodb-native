var Runner = require('integra').Runner
	, Cover = require('integra').Cover
	, NodeVersionFilter = require('./filters/node_version_filter')
	, MongoDBVersionFilter = require('./filters/mongodb_version_filter')
	, MongoDBTopologyFilter = require('./filters/mongodb_topology_filter')
	, FileFilter = require('integra').FileFilter;

/**
 * Standalone MongoDB Configuration
 */
var f = require('util').format;

var StandaloneConfiguration = function(context) {
	var mongo = require('../lib/mongodb');
	var Db = mongo.Db;
	var Server = mongo.Server;
	var ServerManager = require('../test/tools/server_manager').ServerManager;
  var database = "integration_tests";
  var url = "mongodb://%slocalhost:27017/" + database;
  var manager = new ServerManager({
  	journal:false
  });  

	return {		
		start: function(callback) {
      manager.start(true, function(err) {
        if(err) throw err;
        callback();
      });
		},

		shutdown: function(callback) {
      manager.killAll(function(err) {
        callback();
      });        
		},

		restart: function(callback) {
			manager.stop(3, function() {
				serverManager.start(false, callback);
			})
		},

		setup: function(callback) {
			callback();
		},

		teardown: function(callback) {
			callback();
		},

		newDbInstance: function(dbOptions, serverOptions) {
			var port = serverOptions && serverOptions.port || 27017;
			var host = serverOptions && serverOptions.host || "localhost";
			if(dbOptions.w == null
					&& dbOptions.fsync == null
					&& dbOptions.wtimeout == null
					&& dbOptions.j == null) dbOptions.w = 1;
			// Return a new db instance
			return new Db(database, new Server(host, port, serverOptions), dbOptions);
		},

		newDbInstanceWithDomainSocket: function(dbOptions, serverOptions) {
			var host = serverOptions && serverOptions.host || "/tmp/mongodb-27017.sock";

			// If we explicitly testing undefined port behavior
			if(serverOptions && serverOptions.port == 'undefined') {
				return new Db('integration_tests', new Server(host, undefined, serverOptions), dbOptions);
			}

			// Normal socket connection
      return new Db('integration_tests', new Server(host, serverOptions), dbOptions);
		},

		url: function(username, password) {
			var auth = "";

			if(username && password) {
				auth = f("%s:%s@", username, password);
			}

			return f(url, auth);
		},

		// Additional parameters needed
		require: mongo,
		database: database,
		nativeParser: true,
		port: 27017,
		host: 'localhost',
		writeConcern: {w: 1}
	}
}

var ReplicasetConfiguration = function(context) {
	var mongo = require('../lib/mongodb');
	var Db = mongo.Db;
	var Server = mongo.Server;
	var ReplSet = mongo.ReplSet;
	var ReplicaSetManager = require('../test/tools/replica_set_manager').ReplicaSetManager;
  var database = "integration_tests";
  var url = "mongodb://%slocalhost:30000/" + database;
  var startPort = 30000;

  // Replicaset settings
  var replicasetOptions = { 
      retries:120, secondary_count:2
    , passive_count:0, arbiter_count:1
    , start_port: startPort
    , tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]
  }

  // Set up replicaset manager
  var manager = new ReplicaSetManager(replicasetOptions);
  var replSet = null;

	return {		
		start: function(callback) {
      manager.startSet(true, function(err) {
        if(err) throw err;
        callback();
      });
		},

		shutdown: function(callback) {
      manager.killSetServers(function(err) {
        callback();
      });
		},

		restart: function(callback) {
			var self = this;

      manager.killSetServers(function(err) {
        self.start(callback);
      });
		},

		setup: function(callback) {
			callback();
		},

		teardown: function(callback) {
			callback();
		},

		newDbInstance: function(dbOptions, serverOptions) {
			if(dbOptions.w == null
					&& dbOptions.fsync == null
					&& dbOptions.wtimeout == null
					&& dbOptions.j == null) dbOptions.w = 'majority';
			serverOptions = serverOptions || {};
			var port = serverOptions.port || startPort;
			var host = serverOptions.host || "localhost";

			// Return the db
      return new Db('integration_tests'
      	, new ReplSet([new Server(host, port, serverOptions)]
      	, {poolSize:1}), dbOptions);      
		},

		newDbInstanceWithDomainSocket: function(dbOptions, serverOptions) {
			return new Db('integration_tests'
				, new ReplSet([new Server(host, serverOptions)]
				, {poolSize:1}), dbOptions);      
		},

		url: function(username, password) {
			var auth = "";

			if(username && password) {
				auth = f("%s:%s@", username, password);
			}

			return f(url, auth);
		},

		// Additional parameters needed
		require: mongo,
		database: database,
		nativeParser: true,
		port: 30000,
		host: 'localhost',
		writeConcern: {w: 'majority'}
	}
}

var ShardingConfiguration = function(context) {
	var mongo = require('../lib/mongodb');
	var Db = mongo.Db;
	var Server = mongo.Server;
	var Mongos = mongo.Mongos;
	var ShardedManager = require('../test/tools/sharded_manager').ShardedManager;
  var database = "integration_tests";
  var replStartPort = 30000;
  var mongosStartPort = 27017;
  var url = "mongodb://%slocalhost:" + mongosStartPort + "/" + database;

  // Replicaset settings
  var options = { 
  		numberOfReplicaSets: 1
  	,	numberOfMongosServers: 1
  	, replPortRangeSet: replStartPort
  	, mongosRangeSet: mongosStartPort
  	, db: database
  	, collection: 'test_distinct_queries'
  }

  // Set up replicaset manager
  var manager = new ShardedManager(options);
  var replSet = null;

	return {		
		start: function(callback) {
      manager.start(function(err) {
        if(err) throw err;
        // manager.shardCollection('test_distinct_queries', {a:1}, function(err) {
        // 	if(err) throw err;
	        callback();
        // });
      });
		},

		shutdown: function(callback) {
      manager.killSetServers(function(err) {
        callback();
      });
		},

		restart: function(callback) {
			var self = this;

      manager.killSetServers(function(err) {
        self.start(callback);
      });
		},

		setup: function(callback) {
			callback();
		},

		teardown: function(callback) {
			callback();
		},

		newDbInstance: function(dbOptions, serverOptions) {
			if(dbOptions.w == null
					&& dbOptions.fsync == null
					&& dbOptions.wtimeout == null
					&& dbOptions.j == null) dbOptions.w = 'majority';
			serverOptions = serverOptions || {};
			var port = serverOptions.port || mongosStartPort;
			var host = serverOptions.host || "localhost";

			// Return the db
      return new Db('integration_tests'
      	, new Mongos([new Server(host, port, serverOptions)]
      	, {poolSize:1}), dbOptions);      
		},

		newDbInstanceWithDomainSocket: function(dbOptions, serverOptions) {
			return new Db('integration_tests'
				, new Mongos([new Server(host, serverOptions)]
				, {poolSize:1}), dbOptions);      
		},

		url: function(username, password) {
			var auth = "";

			if(username && password) {
				auth = f("%s:%s@", username, password);
			}

			return f(url, auth);
		},

		// Additional parameters needed
		require: mongo,
		database: database,
		nativeParser: true,
		port: 30000,
		host: 'localhost',
		writeConcern: {w: 'majority'}
	}
}

// Set up the runner
var runner = new Runner({
		logLevel:'error'
	, runners: 1
	, failFast: true
});

var testFiles =[
		// '/test/tests/functional/mongo_reply_parser_tests.js'
  // , '/test/tests/functional/connection_pool_tests.js'
  // , '/test/tests/functional/gridstore/readstream_tests.js'
  // , '/test/tests/functional/gridstore/grid_tests.js'
  // , '/test/tests/functional/gridstore/gridstore_direct_streaming_tests.js'
  // , '/test/tests/functional/gridstore/gridstore_tests.js'
  // , '/test/tests/functional/gridstore/gridstore_stream_tests.js'
  // , '/test/tests/functional/gridstore/gridstore_file_tests.js'
  // , '/test/tests/functional/util_tests.js'
  // , '/test/tests/functional/multiple_db_tests.js'
  // , '/test/tests/functional/logging_tests.js'
  // , '/test/tests/functional/custom_pk_tests.js'
  // , '/test/tests/functional/geo_tests.js'
  // , '/test/tests/functional/write_preferences_tests.js'
  // , '/test/tests/functional/remove_tests.js'
  // , '/test/tests/functional/unicode_tests.js'
  // , '/test/tests/functional/raw_tests.js'
  // , '/test/tests/functional/mapreduce_tests.js'
  // , '/test/tests/functional/cursorstream_tests.js'
  , '/test/tests/functional/index_tests.js'
  // , '/test/tests/functional/cursor_tests.js'
  // , '/test/tests/functional/find_tests.js'
  // , '/test/tests/functional/insert_tests.js'
  // , '/test/tests/functional/admin_mode_tests.js'
  // , '/test/tests/functional/aggregation_tests.js'
  // , '/test/tests/functional/exception_tests.js'
  // , '/test/tests/functional/error_tests.js'
  // , '/test/tests/functional/command_generation_tests.js'
  // , '/test/tests/functional/uri_tests.js'
  // , '/test/tests/functional/url_parser_tests.js'
  // , '/test/tests/functional/objectid_tests.js'
  // , '/test/tests/functional/connection_tests.js'
  // , '/test/tests/functional/collection_tests.js'
  // , '/test/tests/functional/db_tests.js'
  // , '/test/tests/functional/read_preferences_tests.js'
  // // , '/test/tests/functional/fluent_api/aggregation_tests.js'
  // , '/test/tests/functional/maxtimems_tests.js'
  // , '/test/tests/functional/mongo_client_tests.js'
  // , '/test/tests/functional/fluent_api/batch_write_ordered_tests.js'
  // , '/test/tests/functional/fluent_api/batch_write_unordered_tests.js'
  // , '/test/tests/functional/fluent_api/batch_write_concerns_tests.js'
]

// Add all the tests to run
testFiles.forEach(function(t) {
	if(t != "") runner.add(t);
});

// // Add the Coverage plugin
// runner.plugin(new Cover({
// 	logLevel: "error"
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

// Run the tests
// runner.run(StandaloneConfiguration);
// runner.run(ReplicasetConfiguration);
runner.run(ShardingConfiguration);






