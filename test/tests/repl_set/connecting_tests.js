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
    test.equal(null, err);
    var dbCloseCount = 0, serverCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });

    // Force a close on a socket
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
    db.on('close', function() { 
      ++dbCloseCount; 
    });

    db.close(function() {
      // Let all events fire.
      process.nextTick(function() {
        test.equal(dbCloseCount, 1);
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

exports['Should correctly emit all signals even if not yet connected'] = function(configuration, test) {
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

  var db_conn = new Db('integration_test_', replSet, {w:1});
  var db2 = db_conn.db('integration_test_2');
  var close_count = 0;
  var open_count = 0;
  var fullsetup_count = 0;

  db2.on('close', function() {
    close_count = close_count + 1;
  });                                                                             
  
  db_conn.on('close', function() {
    close_count = close_count + 1;
  });                                                                             

  db2.on('open', function(err, db) {
    // console.log("============================================= open 1 :: " + db.databaseName)
    test.equal('integration_test_2', db.databaseName);
    open_count = open_count + 1;
  }); 

  db_conn.on('open', function(err, db) {
    // console.log("============================================= open 2 :: " + db.databaseName)
    test.equal('integration_test_', db.databaseName);
    open_count = open_count + 1;
  });

  db2.on('fullsetup', function(err, db) {
    // console.log("============================================= fullsetup 1 :: " + db.databaseName)
    test.equal('integration_test_2', db.databaseName);
    fullsetup_count = fullsetup_count + 1;
  });

  db_conn.on('fullsetup', function(err, db) {
    // console.log("============================================= fullsetup 2 :: " + db.databaseName)
    test.equal('integration_test_', db.databaseName);
    fullsetup_count = fullsetup_count + 1;
  });

  db_conn.open(function (err) {                                                   
    if (err) throw err;                                                           
                                                                                  
    var col1 = db_conn.collection('test');                                        
    var col2 = db2.collection('test');                                            
                                                                                  
    var testData = { value : "something" };                                       
    col1.insert(testData, function (err) {                                        
      if (err) throw err;                                                         

      var testData = { value : "something" };                                       
      col2.insert(testData, function (err) {                                      
        if (err) throw err;                                                       
        db2.close(function() {
          setTimeout(function() {
            // console.log("========================================= results")
            // console.dir("close_count :: " + close_count)
            // console.dir("open_count :: " + open_count)
            // console.dir("fullsetup_count :: " + fullsetup_count)

            test.equal(2, close_count);
            test.equal(2, open_count);
            test.equal(2, fullsetup_count);
            test.done();            
          }, 1000);
        });                                                                      
      });                                                                         
    });                                                                           
  });               
}

exports['Should receive all events for primary and secondary leaving'] = function(configuration, test) {
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

  // Counters to track emitting of events
  var numberOfJoins = 0;
  var numberLeaving = 0;

  // Add some listeners
  replSet.on("left", function(_server_type, _server) {
    numberLeaving += 1;
    // console.log("========================= " + _server_type + " at " + _server.host + ":" + _server.port + " left")
  });

  replSet.on("joined", function(_server_type, _doc, _server) {
    numberOfJoins += 1;
    // console.log("========================= " + _server_type + " at " + _server.host + ":" + _server.port + " joined")
    // console.dir(_doc)
  });

  // Connect to the replicaset
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    // Kill the secondary
    replicasetManager.killSecondary(function() {
      test.equal(null, err);
      p_db.close();
      test.equal(3, numberOfJoins);
      test.equal(1, numberLeaving);
      test.done();
    });
  });
}

