var Runner = require('integra').Runner
	, Cover = require('integra').Cover
	, NodeVersionFilter = require('./filters/node_version_filter')
	, MongoDBVersionFilter = require('./filters/mongodb_version_filter')
	, FileFilter = require('integra').FileFilter;

/**
 * Standalone MongoDB Configuration
 */
var StandaloneConfiguration = function(context) {
	var Db = require('../lib/mongodb').Db;
	var Server = require('../lib/mongodb').Server;
	var ServerManager = require('../test/tools/server_manager').ServerManager;
  var serverManager = new ServerManager();
  var database = "integration_tests";

	return {		
		start: function(callback) {
      serverManager.start(true, function(err) {
        if(err) throw err;
        callback();
      });
		},

		shutdown: function(callback) {
      serverManager.killAll(function(err) {
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
			return new Db(database, new Server("localhost", 27017, serverOptions), dbOptions);
		}
	}
}

// Set up the runner
var runner = new Runner({
		logLevel:'error'
	, runners: 1
	, failFast: true
});

// Add tests
runner.add('/test/tests/functional/aggregation_tests.js');

// Add the Coverage plugin
runner.plugin(new Cover({
	logLevel: "error"
}));

// Add a Node version plugin
runner.plugin(new NodeVersionFilter());
// Add a MongoDB version plugin
runner.plugin(new MongoDBVersionFilter());

// Exit when done
runner.on('exit', function(errors, results) {
	process.exit(0)
});

// Run the tests
runner.run(StandaloneConfiguration);