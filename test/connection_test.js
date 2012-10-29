var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  connect = mongodb.connect,
  Script = require('vm'),
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../test/tools/server_manager').ServerManager;

// Test db
var MONGODB = 'integration_tests';
var client = null;

function connectionTester(test, testName, callback) {
  return function(err, db) {
    test.equal(err, null);
    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};
      collection.insert({foo:123}, {safe:true}, function(err, docs) {
        test.equal(err, null);
        db.dropDatabase(function(err, done) {
          test.equal(err, null);
          test.ok(done);
          callback();
        });
      });
    });
  };
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

exports.shouldThrowErrorDueToSharedConnectionUsage = function(test) {
  var server = new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL});

  try {
    var db = new Db(MONGODB, server, {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
    var db1 = new Db(MONGODB, server, {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  } catch(err) {
    if (db) db.close();
    if (db1) db1.close();
    test.done();
  }
}

/* does not work
exports.shouldCorrectlyCallCloseEvent = function(test) {
  if(process.env['JENKINS']) return test.done();
  var closedCalled = false;
  var openCalled = false

  // Add a open listener
  client.once("open", function(err) {
    openCalled = true;
  })

  // Add a close listener
  client.once("close", function(err) {
    closedCalled = true;
  })

  var serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true})
  // Kill the server
  serverManager.killAll(function() {

    // Restart the server
    serverManager.start(true, function() {
      test.equal(true, closedCalled);

      // Attempt to connect again
      client.open(function(err, result) {
        test.equal(null, err)
        test.equal(true, openCalled);
        test.done();
      })
    });
  });
}
*/

/* does not work
exports.shouldCorrectlyReconnectOnNonExistingServer = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Start server
  var serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true})
  // Kill the server
  serverManager.killAll(function() {
    var _client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
    _client.open(function(err, __client) {
      test.ok(err != null);
      // Restart the server
      serverManager.start(true, function() {
        _client.open(function(err, __client) {
          test.ok(err == null);
          _client.close();
          test.done();
        });
      });
    });
  });
}
*/

exports.shouldCorrectlyOpenCloseAndOpenAgain = function(test) {
  var server = new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL});
  var db = new Db(MONGODB, server, {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db){
    test.equal(null, err);

    db.close(function(){
      test.equal(null, err);

      db.open(function(){
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  });
}

exports.testCloseNoCallback = function(test) {
  var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(connectionTester(test, 'testCloseNoCallback', function() {
    var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
    // Ensure no close events are fired as we are closing the connection specifically
    db.on('close', function() { dbCloseCount++; });

    var connectionPool = db.serverConfig.connectionPool;
    var connections = connectionPool.getAllConnections();

    // Force the connection close, should not trigger close command
    db.serverConfig.connectionPool.stop();
    // Test done
    test.equal(0, dbCloseCount);
    test.done();
  }));
}

exports.testCloseWithCallback = function(test) {
  var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}),{safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(connectionTester(test, 'testCloseWithCallback', function() {
    var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
    // Ensure no close events are fired as we are closing the connection specifically
    db.on('close', function() { dbCloseCount++; });

    var connectionPool = db.serverConfig.connectionPool;
    var connections = connectionPool.getAllConnections();

    // Ensure no close events are fired as we are closing the connection specifically
    for(var i = 0; i < connections.length; i++) {
      connections[i].on("close", function() { test.ok(false); });
    }

    db.close(function() {
      // Test done
      test.equal(0, dbCloseCount);
      test.done();
    });
  }));
}

exports.testShouldCorrectlyCloseOnUnopedConnection = function(test) {
  var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}),{safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.close();
  test.done();
}

exports.testConnectUsingDefaultHostAndPort = function(test) {
  var db = new Db(MONGODB, new Server("127.0.0.1", mongodb.Connection.DEFAULT_PORT, {auto_reconnect: true, poolSize: 4, ssl:useSSL}),{safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    test.equal(null, err);
    test.done();
    db.close();
  })
}

exports.testConnectUsingSocketOptions = function(test) {
  var db = new Db(MONGODB, new Server("127.0.0.1", mongodb.Connection.DEFAULT_PORT, {auto_reconnect: true, poolSize: 4, socketOptions:{keepAlive:100}, ssl:useSSL}),{safe:false, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    test.equal(null, err);
    test.equal(100, db.serverConfig.checkoutWriter().socketOptions.keepAlive)
    test.done();
    db.close();
  })
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
