var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  async = require('async'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../../test/tools/server_manager').ServerManager,
  Step = require("step");

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var serverManager = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  callback();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  // serverManager.killAll(function(err, result) {
    callback();
  // });
}

exports.shouldCorrectlyAuthenticateWithHorribleBananaCode = function(test) {
  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  var db2 = new Db('mongo-ruby-test-auth2', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  var admin = new Db('admin', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});

  serverManager = new ServerManager({auth:false, purgedirectories:true})
  serverManager.start(true, function(err, result) {
    db1.open(function(err, result) {
      db2.open(function(err, result) {
        admin.open(function(err, result) {
          admin.addUser('admin', 'admin', function(err, result) {
            serverManager = new ServerManager({auth:true, purgedirectories:false})
            serverManager.start(true, function(err, result) {
              admin.authenticate('admin', 'admin', function(err, result1) {

                db1.admin().authenticate('admin', 'admin', function(err, result2) {

                  db2.admin().authenticate('admin', 'admin', function(err, result3) {

                    db1.addUser('user1', 'secret', function(err, result1) {

                      db2.addUser('user2', 'secret', function(err, result2) {
                        test.ok(result1 != null);
                        test.ok(result2 != null);

                        admin.logout(function(err, _result1) {

                          db1.admin().logout(function(err, _result2) {

                            db2.admin().logout(function(err, _result3) {
                              test.equal(true, _result1);
                              test.equal(true, _result2);
                              test.equal(true, _result3);

                              var col1 = db1.collection('stuff');
                              var col2 = db2.collection('stuff');

                              col1.insert({a:2}, {safe:{j:true}}, function(err1, result) {

                                col2.insert({a:2}, {safe:{j:true}}, function(err2, result) {
                                  test.ok(err1 != null);
                                  test.ok(err2 != null);

                                  db1.authenticate('user1', 'secret', function(err, result1) {

                                    db2.authenticate('user2', 'secret', function(err, result2) {
                                      test.ok(result1);
                                      test.ok(result2);

                                      col1.insert({a:2}, {safe:{j:true}}, function(err1, result) {

                                        col2.insert({a:2}, {safe:{j:true}}, function(err2, result) {
                                          test.equal(null, err1);
                                          test.equal(null, err2);

                                          serverManager = new ServerManager({auth:true, purgedirectories:false})
                                          serverManager.start(true, function(err, result) {

                                            col1.find({}).toArray(function(err, items) {
                                              test.ok(err == null);
                                              test.equal(1, items.length);

                                              col1.insert({a:2}, {safe:{j:true}}, function(err1, result) {
                                                col2.insert({a:2}, {safe:{j:true}}, function(err2, result) {
                                                  db1.logout(function(err, result) {
                                                    test.ok(err == null);
                                                    test.ok(result);

                                                    col1.insert({a:2}, {safe:{j:true}}, function(err, result) {
                                                      test.ok(err != null);

                                                      db2.logout(function(err, result) {
                                                        test.ok(err == null);
                                                        test.ok(result);

                                                        col2.insert({a:2}, {safe:{j:true}}, function(err, result) {
                                                          test.ok(err != null);

                                                          test.done();
                                                          db1.close();
                                                          db2.close();
                                                          admin.close();
                                                        });
                                                      });
                                                    });
                                                  });
                                                });
                                              });
                                            })
                                          });
                                        });
                                      });
                                    });
                                  });
                                })
                              })
                            })
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        })
      })
    })
  });
}

exports.shouldCorrectlyAuthenticate = function(test) {
  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  var db2 = new Db('mongo-ruby-test-auth2', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  var admin = new Db('admin', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});

  Step(
    function bootTheServerWithNoAuth() {
      serverManager = new ServerManager({auth:false, purgedirectories:true})
      serverManager.start(true, this);
    },

    function openDbs() {
      db1.open(this.parallel());
      db2.open(this.parallel());
      admin.open(this.parallel());
    },

    function addAdminUserToDatabase(err, db1, db2, admin) {
      test.equal(null, err);
      admin.addUser('admin', 'admin', this);
    },

    function restartServerInAuthMode(err, result) {
      test.equal(null, err);
      test.equal('7c67ef13bbd4cae106d959320af3f704', result.shift().pwd);

      db1.close();
      db2.close();
      admin.close();

      serverManager = new ServerManager({auth:true, purgedirectories:false})
      serverManager.start(true, this);
    },

    function openDbs() {
      db1.open(this.parallel());
      db2.open(this.parallel());
      admin.open(this.parallel());
    },

    function authenticateAdminUser(err) {
      test.equal(null, err);

      admin.authenticate('admin', 'admin', this.parallel());
      db1.admin().authenticate('admin', 'admin', this.parallel());
      db2.admin().authenticate('admin', 'admin', this.parallel());
    },

    function addDbUsersForAuthentication(err, result1, result2, result3) {
      test.equal(null, err);
      test.ok(result1);
      test.ok(result2);
      test.ok(result3);

      db1.addUser('user1', 'secret', this.parallel());
      db2.addUser('user2', 'secret', this.parallel());
    },

    function closeAdminConnection(err, result1, result2) {
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);
      admin.logout(this.parallel());
      db1.admin().logout(this.parallel());
      db2.admin().logout(this.parallel());
    },

    function failAuthenticationWithDbs(err, result) {
      var self = this;

      db1.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:true}, self.parallel());
      });

      db2.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:true}, self.parallel());
      });
    },

    function authenticateAgainstDbs(err, result) {
      test.ok(err != null);

      db1.authenticate('user1', 'secret', this.parallel());
      db2.authenticate('user2', 'secret', this.parallel());
    },

    function correctlyInsertRowToDbs(err, result1, result2) {
      var self = this;
      test.ok(err == null);
      test.ok(result1);
      test.ok(result2);

      db1.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:{j:true}}, self.parallel());
      });

      db2.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:{j:true}}, self.parallel());
      });
    },

    function validateCorrectInsertsAndBounceServer(err, result1, result2) {
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);

      serverManager = new ServerManager({auth:true, purgedirectories:false})
      serverManager.start(true, this);
    },

    function reconnectAndVerifyThatAuthIsAutomaticallyApplied() {
      var self = this;
      db1.collection('stuff', function(err, collection) {
        collection.find({}).toArray(function(err, items) {
          test.ok(err == null);
          test.equal(1, items.length);

          db1.collection('stuff', function(err, collection) {
            collection.insert({a:2}, {safe:true}, self.parallel());
          });

          db2.collection('stuff', function(err, collection) {
            collection.insert({a:2}, {safe:true}, self.parallel());
          });
        })
      });
    },

    function logoutDb1(err, result1, result2) {
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);

      db1.logout(this);
    },

    function insertShouldFail(err, result) {
      var self = this;
      db1.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:true}, self.parallel());
      });
    },

    function logoutDb2(err, result) {
      test.ok(err != null);
      db2.logout(this);
    },

    function insertShouldFail(err, result) {
      var self = this;
      db2.collection('stuff', function(err, collection) {
        collection.insert({a:2}, {safe:true}, function(err, result) {
          test.ok(err != null);
          test.done();
          // Close all connections
          db1.close();
          db2.close();
          admin.close();
        });
      });
    }
  )
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