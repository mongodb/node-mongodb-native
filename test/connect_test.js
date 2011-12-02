var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  connect = mongodb.connect,
  gleak = require('../tools/gleak'),
  Script = require('vm'),
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  Step = require("../deps/step/lib/step");

var MONGODB = 'integration_tests';
var clientUrl = 'mongo://localhost:27017/' + MONGODB + (useSSL == true ? '?ssl=true' : '');

function connectionTester(test, testName) {
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
          test.done();
        });
      });
    });
  };
};

exports.testConnectNoOptions = function(test) {
  connect(clientUrl, connectionTester(test, 'testConnectNoOptions'));
};

exports.testConnectDbOptions = function(test) {
  connect(clientUrl,
          { db: {native_parser: (process.env['TEST_NATIVE'] != null)} },
          connectionTester(test, 'testConnectDbOptions'));
};

exports.testConnectServerOptions = function(test) {
  connect(clientUrl,
          { server: {auto_reconnect: true, poolSize: 4} },
          connectionTester(test, 'testConnectServerOptions'));
};

exports.testConnectAllOptions = function(test) {
  connect(clientUrl,
          { server: {auto_reconnect: true, poolSize: 4},
            db: {native_parser: (process.env['TEST_NATIVE'] != null)} },
          connectionTester(test, 'testConnectAllOptions'));
};

exports.testConnectGoodAuth = function(test) {
  var user = 'testConnectGoodAuth', password = 'password';
  // First add a user.
  connect(clientUrl, function(err, db) {
    test.equal(err, null);
    db.addUser(user, password, function(err, result) {
      test.equal(err, null);
      db.close();
      restOfTest();
    });
  });
  function restOfTest() {
    var url = 'mongo://' + user + ':' + password + '@localhost:27017/' + MONGODB + (useSSL == true ? '?ssl=true' : '');
    connect(url, connectionTester(test, 'testConnectGoodAuth'));
  }
};

exports.testConnectBadAuth = function(test) {
  var url = 'mongo://slithy:toves@localhost:27017/' + MONGODB + (useSSL == true ? '?ssl=true' : '');
  connect(url, function(err, db) {
    test.ok(err);
    test.equal(db, null);
    test.done();
  });
};

exports.testConnectBadUrl = function(test) {
  test.throws(function() {
    connect('mango://localhost:27017/' + MONGODB, function(err, db) {
      test.ok(false, 'Bad URL!');
    });
  });
  test.done();
};

// run this last
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}
