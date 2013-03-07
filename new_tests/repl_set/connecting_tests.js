exports['Should throw error due to shared connection usage'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;
  
  var replSet = new ReplSetServers([
      new Server('localhost', 28390),
      new Server('localhost', 28391),
      new Server('localhost', 28392)
    ]
  );

  try {
    var db = new Db(MONGODB, replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
    var db1 = new Db(MONGODB, replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  } catch(err) {
    test.done();
  }
}

exports['Should throw error due to mongos connection usage'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Mongos = mongo.Mongos;

  try {
    var replSet = new ReplSetServers([
        new Server('localhost', 28390),
        new Server('localhost', 28391),
        new Mongos([new Server('localhost', 28392)])
      ]
    );
  } catch(err) {
    test.done();
  }
}

exports['Should correctly handle error when no server up in replicaset'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server('localhost', 28390),
      new Server('localhost', 28391),
      new Server('localhost', 28392)
    ]
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.ok(err != null);
    test.done();
  });
}

/**
 * Simple replicaset connection setup, requires a running replicaset on the correct ports
 *
 * @_class db
 * @_function open
 */
exports['Should correctly connect with default replicasetNoOption'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ]
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(null, err);
    p_db.close();
    test.done();
  });
}

exports['Should correctly connect with default replicaset'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(null, err);
    p_db.close();
    test.done();
  })
}

exports['Should correctly connect with default replicaset and socket options set'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {socketOptions:{keepAlive:100}}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(null, err);
    test.equal(100, db.serverConfig.checkoutWriter().socketOptions.keepAlive)
    p_db.close();
    test.done();
  })
}

exports['Should emit close no callback'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ], {}
  );

  new Db('integration_test_', replSet, {w:0}).open(function(err, db) {
    test.equal(null, err);
    var dbCloseCount = 0, serverCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });
    db.close();

    setTimeout(function() {
      test.equal(dbCloseCount, 1);
      test.done();
    }, 2000);
  })
}

exports['Should emit close with callback'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ], {}
  );

  new Db('integration_test_', replSet, {w:0}).open(function(err, db) {
    test.equal(null, err);
    var dbCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });

    db.close(function() {
      // Let all events fire.
      process.nextTick(function() {
        test.equal(dbCloseCount, 0);
        test.done();
      });
    });
  })
}

exports['Should correctly pass error when wrong replicaSet'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name + "-wrong"}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.notEqual(null, err);
    test.done();
  })
}

var retries = 120;

var ensureConnection = function(mongo, replicasetManager, numberOfTries, callback) {
  var ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
  );

  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);
  // Open the db
  new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
    if(p_db) p_db.close();

    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(mongo, replicasetManager, numberOfTries, callback);
      }, 3000);
    } else {
      return callback(null);
    }
  })
}

exports['Should connect with primary stepped down'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
  );

  // Step down primary server
  configuration.stepDownPrimary(function(err, result) {
    // Wait for new primary to pop up
    ensureConnection(mongo, replicasetManager, retries, function(err, p_db) {

      new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
        test.ok(err == null);
        test.equal(true, p_db.serverConfig.isConnected());

        p_db.close();
        test.done();
      })
    });
  });
}

exports['Should connect with third node killed'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Kill specific node
  configuration.getNodeFromPort(replicasetManager.ports[2], function(err, node) {

    configuration.kill(node, function(err, result) {

      // Replica configuration
      var replSet = new ReplSetServers( [
          new Server(replicasetManager.host, replicasetManager.ports[0]),
          new Server(replicasetManager.host, replicasetManager.ports[1]),
          new Server(replicasetManager.host, replicasetManager.ports[2])
        ],
        {rs_name:replicasetManager.name}
      );

      // Wait for new primary to pop up
      ensureConnection(mongo, replicasetManager, retries, function(err, p_db) {
        
        new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
          test.ok(err == null);
          test.equal(true, p_db.serverConfig.isConnected());

          p_db.close();
          test.done();
        })
      });
    });
  });
}

exports['Should connect with secondary node killed'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Kill a secondary
  configuration.killSecondary(function(node) {

    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ],
      {rs_name:replicasetManager.name}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.ok(err == null);
      test.equal(true, p_db.serverConfig.isConnected());

      // Close and cleanup
      p_db.close();
      test.done();
    })
  });
}

exports['Should connect with primary node killed'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  // Kill primary
  replicasetManager.killPrimary(function(node) {

    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ],
      {rs_name:replicasetManager.name}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    ensureConnection(mongo, replicasetManager, retries, function(err, p_db) {
      if(err != null && err.stack != null) console.log(err.stack)
      test.done();
    });
  });
}

exports['Should correctly be able to use port accessors'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(replSet.host, p_db.serverConfig.primary.host);
    test.equal(replSet.port, p_db.serverConfig.primary.port);

    p_db.close();
    test.done();
  })
}

exports['Should correctly emit open signal and full set signal'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  
  var openCalled = false;
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.once("open", function(_err, _db) {
    openCalled = true;
  });

  db.once("fullsetup", function(_err, _db) {
    test.equal(true, openCalled);

    // Close and cleanup
    _db.close();
    test.done();
  })

  db.open(function(err, p_db) {})
}

exports['Should correctly connect'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, connectArbiter:true}
  );

  // Replica configuration
  var replSet2 = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, connectArbiter:true}
  );

  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(true, p_db.serverConfig.isConnected());

    // Test primary
    replicasetManager.primary(function(err, primary) {
      test.notEqual(null, primary);
      test.equal(primary, p_db.serverConfig.primary.host + ":" + p_db.serverConfig.primary.port);

      // Perform tests
      replicasetManager.secondaries(function(err, items) {
        // Test if we have the right secondaries
        test.deepEqual(items.sort(), p_db.serverConfig.allSecondaries.map(function(item) {
                                        return item.host + ":" + item.port;
                                      }).sort());

        // Test if we have the right arbiters
        replicasetManager.arbiters(function(err, items) {
          test.deepEqual(items.sort(), p_db.serverConfig.arbiters.map(function(item) {
                                          return item.host + ":" + item.port;
                                        }).sort());
          // Force new instance
          var db2 = new Db('integration_test_', replSet2, {w:0});
          db2.open(function(err, p_db2) {
            if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));

            test.equal(true, p_db2.serverConfig.isConnected());
            // Close top instance
            db.close();
            db2.close();
            test.done();
          });
        });
      });
    })
  });
}

exports['ReplSet honors connectTimeoutMS option'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var set = new ReplSetServers([
      new Server('localhost', 27107, { auto_reconnect: true } ),
      new Server('localhost', 27018, { auto_reconnect: true } ),
      new Server('localhost', 27019, { auto_reconnect: true } )
    ],
    {socketOptions: {connectTimeoutMS: 200} }
  );

  test.equal(200, set.socketOptions.connectTimeoutMS)
  test.equal(200, set._connectTimeoutMS)
  test.done();
}
