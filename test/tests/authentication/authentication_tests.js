var Step = require('step');

/**
 * @ignore
 */
exports['Should Correctly Authenticate using different user source database and MongoClient on single server'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // Kill server and restart
  configuration.restart(function() {
    var auth_db = new Db('foo', new Server('localhost', 27017), {w:1});
    var db = new Db('users', new Server('localhost', 27017), {w:1});
    db.open(function(err, db) {

      // Add admin user
      db.admin().addUser('admin', 'admin', function(err, result) {
        test.equal(null, err);
        test.ok(result != null);

        // Authenticate
        db.admin().authenticate('admin', 'admin', function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          db.addUser('mallory', 'a', function(err, result) {
            test.equal(null, err);
            test.ok(result != null);

            db.db('foo').collection('system.users').insert({user:"mallory", roles: ["readWrite"], userSource: "users"}, function(err, result) {
              test.equal(null, err);

              // Exit
              db.close();

              //
              // Authenticate using MongoClient
              new MongoClient().connect('mongodb://mallory:a@localhost:27017/foo?authSource=users', function(err, db) {
                test.equal(null, err);

                db.collection('t').insert({a:1}, function(err, result) {
                  test.equal(null, err);
                  db.close();

                  //
                  // Authenticate using db.authenticate against alternative source
                  auth_db.open(function(err, db) {

                    db.authenticate('mallory', 'a', {authSource:'users'}, function(err, result) {
                      test.equal(null, err);
                      test.equal(true, result);

                      db.collection('t').insert({a:1}, function(err, result) {
                        test.equal(null, err);

                        db.close();
                        test.done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithHorribleBananaCode = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server;

  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
  var db2 = new Db('mongo-ruby-test-auth2', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
  var admin = new Db('admin', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});

  db1.open(function(err, result) {
    db2.open(function(err, result) {
      admin.open(function(err, result) {
        admin.addUser('admin', 'admin', function(err, result) {

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
                                                    // console.dir(err)
                                                    // console.dir(result)
                                                    test.ok(err != null); 
                                                    db1.close();
                                                    db2.close();
                                                    admin.close();
                                                    test.done();
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
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server;

  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
  var db2 = new Db('mongo-ruby-test-auth2', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
  var admin = new Db('admin', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});

  Step(
    function openDbs() {
      console.log("=================================================== 0")
      db1.open(this.parallel());
      db2.open(this.parallel());
      admin.open(this.parallel());
    },

    function addAdminUserToDatabase(err, db1, db2, admin) {
      console.log("=================================================== 1")
      test.equal(null, err);
      admin.addUser('admin', 'admin', this);
    },

    function restartServerInAuthMode(err, result) {
      console.log("=================================================== 2")
      console.dir(err)
      console.dir(result)
      test.equal(null, err);
      // test.equal('7c67ef13bbd4cae106d959320af3f704', result.shift().pwd);
      test.equal('admin', result.shift().user);
      console.log("=================================================== 2:1")

      db1.close();
      db2.close();
      admin.close();
      console.log("=================================================== 2:2")

      serverManager = new ServerManager({auth:true, purgedirectories:false})
      serverManager.start(true, this);
    },

    function openDbs() {
      console.log("=================================================== 3")
      db1.open(this.parallel());
      db2.open(this.parallel());
      admin.open(this.parallel());
    },

    function authenticateAdminUser(err) {
      console.log("=================================================== 4")
      console.dir(err)
      test.equal(null, err);

      admin.authenticate('admin', 'admin', this.parallel());
      db1.admin().authenticate('admin', 'admin', this.parallel());
      db2.admin().authenticate('admin', 'admin', this.parallel());
    },

    function addDbUsersForAuthentication(err, result1, result2, result3) {
      console.log("=================================================== 5")
      // test.equal(null, err);
      console.dir(err)
      console.dir(result1)
      console.dir(result2)
      console.dir(result3)

      test.ok(result1);
      test.ok(result2);
      test.ok(result3);

      db1.addUser('user1', 'secret', this.parallel());
      db2.addUser('user2', 'secret', this.parallel());
    },

    function closeAdminConnection(err, result1, result2) {
      console.log("=================================================== 6")
      console.dir(err)
      console.dir(result1)
      console.dir(result2)
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);
      admin.logout(this.parallel());
      db1.admin().logout(this.parallel());
      db2.admin().logout(this.parallel());
    },

    function failAuthenticationWithDbs(err, result) {
      console.log("=================================================== 7")
      var self = this;

      db1.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {w:1}, self.parallel());
      });

      db2.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {w:1}, self.parallel());
      });
    },

    function authenticateAgainstDbs(err, result) {
      console.log("=================================================== 8")
      test.ok(err != null);

      db1.authenticate('user1', 'secret', this.parallel());
      db2.authenticate('user2', 'secret', this.parallel());
    },

    function correctlyInsertRowToDbs(err, result1, result2) {
      console.log("=================================================== 9")
      var self = this;
      test.ok(err == null);
      test.ok(result1);
      test.ok(result2);

      db1.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {j:true}, self.parallel());
      });

      db2.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {j:true}, self.parallel());
      });
    },

    function reconnectAndVerifyThatAuthIsAutomaticallyApplied(err, result1, result2) {
      console.log("=================================================== 10")
      var self = this;
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);

      db1.collection('stuff2', function(err, collection) {
        collection.find({}).toArray(function(err, items) {
          test.ok(err == null);
          test.equal(1, items.length);

          db1.collection('stuff2', function(err, collection) {
            collection.insert({a:2}, {w:1}, self.parallel());
          });

          db2.collection('stuff2', function(err, collection) {
            collection.insert({a:2}, {w:1}, self.parallel());
          });
        })
      });
    },

    function logoutDb1(err, result1, result2) {
      console.log("=================================================== 11")
      test.ok(err == null);
      test.ok(result1 != null);
      test.ok(result2 != null);
      db1.logout(this);
    },

    function insertShouldFail(err, result) {
      console.log("=================================================== 12")
      var self = this;
      db1.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {w:1}, self.parallel());
      });
    },

    function logoutDb2(err, result) {
      console.log("=================================================== 13")
      console.dir(err)
      test.ok(err != null);
      db2.logout(this);
    },

    function insertShouldFail(err, result) {
      console.log("=================================================== 14")
      var self = this;
      db2.collection('stuff2', function(err, collection) {
        collection.insert({a:2}, {w:1}, function(err, result) {
          console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
          console.dir(err)
          console.dir(result)

          test.ok(err != null);

          // Close all connections
          db1.close();
          db2.close();
          admin.close();
          // process.exit(0)
          test.done();
        });
      });
    }
  )
}