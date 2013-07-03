exports['Should throw error due to shared connection usage'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;
  
    // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  var replSet = new ReplSetServers([
      new Server('localhost', 28390),
      new Server('localhost', 28391),
      new Server('localhost', 28392)
    ]
    , {rs_name:replicasetManager.name}    
  );

  try {
    var db = new Db(MONGODB, replSet, {w:0});
    var db1 = new Db(MONGODB, replSet, {w:0});
  } catch(err) {
    test.done();
  }
}

exports['Should throw error due to mongos connection usage'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Mongos = mongo.Mongos;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  try {
    var replSet = new ReplSetServers([
        new Server('localhost', 28390),
        new Server('localhost', 28391),
        new Mongos([new Server('localhost', 28392)])
      ]
    , {rs_name:replicasetManager.name}    
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

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server('localhost', 28390),
      new Server('localhost', 28391),
      new Server('localhost', 28392)
    ]
    , {rs_name:replicasetManager.name}    
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
    , {rs_name:replicasetManager.name}    
  );

  // DOC_LINE var replSet = new ReplSetServers([
  // DOC_LINE   new Server('localhost', 30000),
  // DOC_LINE   new Server('localhost', 30001),
  // DOC_LINE   new Server('localhost', 30002)
  // DOC_LINE ]);
  // DOC_START
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    test.equal(null, err);
    p_db.close();
    test.done();
  });
  // DOC_END
}

exports['Should correctly connect with default replicaset'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  replicasetManager.killSecondary(function() {
    // Replica configuration
    var replSet = new ReplSetServers([
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ]
      , {rs_name:replicasetManager.name}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.equal(null, err);
      p_db.close();
      test.done();
    })
  });
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
    {socketOptions:{keepAlive:100}, rs_name:replicasetManager.name}
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
    ], {rs_name:replicasetManager.name}
  );

  new Db('integration_test_', replSet, {w:0}).open(function(err, db) {
    // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 1")
    // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 1")
    // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 1")
    // console.dir(err)

    test.equal(null, err);
    var dbCloseCount = 0, serverCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });
    // Force a close on a socket
    // db.serverConfig._state.addresses[replicasetManager.host  + ":" + replicasetManager.ports[0]].connectionPool.openConnections[0].connection.destroy();
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
    ], {rs_name:replicasetManager.name}
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
  // console.log("=========================== ensureConnection")
  var ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, poolSize:1}
  );

  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);
  // Open the db
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    // Close the connection
    db.close();

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
        // console.log("====================================================")
        // console.dir(Object.keys(p_db.serverConfig._state.addresses))
        // console.dir(Object.keys(p_db.serverConfig._state.secondaries))
        // console.dir(p_db.serverConfig._state.master != null)
        // if(p_db.serverConfig._state.master)
        //   console.dir(p_db.serverConfig._state.master.isConnected())

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
      // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 0")
      // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 0")
      // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 0")
      // console.dir(err)
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

exports['ReplSet honors connectTimeoutMS option'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  var set = new ReplSetServers([
      new Server('localhost', 27107),
      new Server('localhost', 27018),
      new Server('localhost', 27019)
    ],
    {socketOptions: {connectTimeoutMS: 200}, rs_name:replicasetManager.name }
  );

  test.equal(200, set.options.socketOptions.connectTimeoutMS)
  test.done();
}

exports['ReplSet should emit close event when whole set is down'] = function(configuration, test) {
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

  var count = 0;
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(_err, _db) {
    test.equal(null, _err);

    var addresses = replSet._state.addresses;
    var db2 = db.db('test');
    db2.once("close", function() {
      count = count + 1;
      test.equal(2, count);
      test.done();    
    });
    
    db.close();
  });

  db.once("close", function() {
    count = count + 1;
  });
}
