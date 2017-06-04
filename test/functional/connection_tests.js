"use strict";

/**
 * @ignore
 */
exports['Should correctly start monitoring for single server connection'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock"});
    console.log("$$$$$$$$$$$$$$$$$$$$$$$")
    console.dir(client)
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      db.serverConfig.once('monitoring', function() {
        client.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly disable monitoring for single server connection'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock", monitoring: false});
    client.connect(function(err, db) {
      var db = client.db(configuration.database);
      test.equal(null, err);
      test.equal(false, db.serverConfig.s.server.s.monitoring);

      client.close();
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to server using domain socket'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock"});
    client.connect(function(err, db) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      db.collection("domainSocketCollection0").insert({a:1}, {w:1}, function(err, item) {
        test.equal(null, err);

        db.collection("domainSocketCollection0").find({a:1}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);

          client.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to server using just events'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:true});
    client.on('open', function() {
      client.close();
      test.done();
    });

    client.connect();
  }
}

/**
 * @ignore
 */
exports['Should correctly identify parser type'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:true});
    client.on('open', function(client) {
      var db = client.db(configuration.database);
      test.equal('js', db.serverConfig.parserType);

      client.close();
      test.done();
    });

    client.connect();
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to server using big connection pool'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }, ignore: { travis:true } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({w:1}, {poolSize:2000, auto_reconnect:true});
    client.on('open', function() {
      client.close();
      test.done();
    });

    client.connect();
  }
}

/**
 * @ignore
 */
exports['Should connect to server using domain socket with undefined port'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock", port:undefined});
    client.connect(function(err, db) {
      var db = client.db(configuration.database);      
      test.equal(null, err);

      db.collection("domainSocketCollection1").insert({x:1}, {w:1}, function(err, item) {
        test.equal(null, err);

        db.collection("domainSocketCollection1").find({x:1}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);

          client.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should fail to connect using non-domain socket with undefined port'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Server = configuration.require.Server
      , MongoClient = configuration.require.MongoClient;

    var error;
    try {
      var client = new MongoClient(new Server("localhost", undefined), {w:0});
      client.connect(function(){ });
    } catch (err){
      error = err;
    }

    test.ok(error instanceof Error);
    test.ok(/port must be specified/.test(error));
    test.done();
  }
}

/**
 * @ignore
 */
function connectionTester(test, configuration, testName, callback) {
  return function(err, client) {
    var db = client.db(configuration.database);
    test.equal(err, null);

    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};

      collection.insert({foo:123}, {w:1}, function(err, docs) {
        test.equal(err, null);

        db.dropDatabase(function(err, done) {
          test.equal(err, null);
          test.ok(done);
          if(callback) return callback(client);
          test.done();
        });
      });
    });
  };
};

/**
 * @ignore
 */
exports.testConnectNoOptions = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(), connectionTester(test, configuration, 'testConnectNoOptions', function(client) {
      client.close();
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectServerOptions = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(),
            { server: {auto_reconnect: true, poolSize: 4} },
            connectionTester(test, configuration, 'testConnectServerOptions', function(client) {
      test.equal(1, client.topology.poolSize);
      test.equal(4, client.topology.s.server.s.pool.size);
      test.equal(true, client.topology.autoReconnect);
      client.close();
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectAllOptions = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(),
            { server: {auto_reconnect: true, poolSize: 4},
              db: {native_parser: (process.env['TEST_NATIVE'] != null)} },
            connectionTester(test, configuration, 'testConnectAllOptions', function(client) {
      test.ok(client.topology.poolSize >= 1);
      test.equal(4, client.topology.s.server.s.pool.size);
      test.equal(true, client.topology.autoReconnect);
      client.close();
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectGoodAuth = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;
    var user = 'testConnectGoodAuth', password = 'password';
    // First add a user.
    connect(configuration.url(), function(err, client) {
      test.equal(err, null);
      var db = client.db(configuration.database);

      db.addUser(user, password, function(err, result) {
        test.equal(err, null);
        client.close();
        restOfTest();
      });
    });

    function restOfTest() {
      connect(configuration.url(user, password), connectionTester(test, configuration, 'testConnectGoodAuth', function(client) {
        client.close();
        test.done();
      }));
    }
  }
}

/**
 * @ignore
 */
exports.testConnectBadAuth = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;
    connect(configuration.url('slithy', 'toves'), function(err, db) {
      test.ok(err);
      test.equal(null, db);
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports.testConnectBadUrl = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    test.throws(function() {
      connect('mangodb://localhost:27017/test?safe=false', function(err, db) {
        test.ok(false, 'Bad URL!');
      });
    });
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnFalseOnIsConnectBeforeConnectionHappened = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    test.equal(false, client.isConnected());
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly reconnect and finish query operation'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    var client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:true});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      db.collection('test_reconnect').insert({a:1}, function(err, doc) {
        test.equal(null, err);
        // Signal db reconnect
        var dbReconnect = 0;
        var dbClose = 0;

        db.on('reconnect', function() {
          ++dbReconnect;
        });

        db.on('close', function() {
          ++dbClose;
        });

        db.serverConfig.once('reconnect', function() {

          // Await reconnect and re-authentication
          db.collection('test_reconnect').findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(1, doc.a);
            test.equal(1, dbReconnect);
            test.equal(1, dbClose);

            // Attempt disconnect again
            db.serverConfig.connections()[0].destroy();

            // Await reconnect and re-authentication
            db.collection('test_reconnect').findOne(function(err, doc) {
              test.equal(null, err);
              test.equal(1, doc.a);
              test.equal(2, dbReconnect);
              test.equal(2, dbClose);

              client.close();
              test.done();
            });
          });
        })

        // Force close
        db.serverConfig.connections()[0].destroy();
      });
    });
  }
}
