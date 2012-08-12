var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
  ReplSetServers = mongodb.ReplSetServers,
  Mongos = mongodb.Mongos,
  Server = mongodb.Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var RS = RS == null ? null : RS;

var ensureConnection = function(test, numberOfTries, callback) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);

  var db = new Db('integration_test_', replSet);
  // Print any errors
  db.on("error", function(err) {
    console.log("============================= ensureConnection caught error")
    console.dir(err)
    if(err != null && err.stack != null) console.log(err.stack)
    db.close();
  })

  // Open the db
  db.open(function(err, p_db) {
    db.close();

    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(test, numberOfTries, callback);
      }, 3000);
    } else {
      return callback(null);
    }
  })
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  // Create instance of replicaset manager but only for the first call
  if(!serversUp && !noReplicasetStart) {
    serversUp = true;
    RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
    // RS = new ReplicaSetManager({retries:120, secondary_count:1, passive_count:0, arbiter_count:0});
    RS.startSet(true, function(err, result) {
      if(err != null) throw err;
      // Finish setup
      callback();
    });
  } else {
    RS.restartKilledNodes(function(err, result) {
      if(err != null) throw err;
      callback();
    })
  }
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  numberOfTestsRun = numberOfTestsRun - 1;
  if(numberOfTestsRun == 0) {
    // Finished kill all instances
    RS.killAll(function() {
      callback();
    })
  } else {
    callback();
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorDueToSharedConnectionUsage = function(test) {
  var replSet = new ReplSetServers([
      new Server('localhost', 28390, { auto_reconnect: true } ),
      new Server('localhost', 28391, { auto_reconnect: true } ),
      new Server('localhost', 28392, { auto_reconnect: true } )
    ]
  );

  try {
    var db = new Db(MONGODB, replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    var db1 = new Db(MONGODB, replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  } catch(err) {
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorDueToMongosConnectionUsage = function(test) {
  try {
    var replSet = new ReplSetServers([
        new Server('localhost', 28390, { auto_reconnect: true } ),
        new Server('localhost', 28391, { auto_reconnect: true } ),
        new Mongos([new Server('localhost', 28392, { auto_reconnect: true } )])
      ]
    );
  } catch(err) {
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleErrorWhenNoServerUpInReplicaset = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server('localhost', 28390, { auto_reconnect: true } ),
      new Server('localhost', 28391, { auto_reconnect: true } ),
      new Server('localhost', 28392, { auto_reconnect: true } )
    ]
  );

  var db = new Db('integration_test_', replSet);
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
exports.shouldCorrectlyConnectWithDefaultReplicasetNoOption = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server('localhost', 30000, { auto_reconnect: true } )
      // new Server('localhost', 30001, { auto_reconnect: true } ),
      // new Server('localhost', 30002, { auto_reconnect: true } )
    ]
  );
  
  var db = new Db('integration_test_', replSet);
  db.open(function(err, p_db) {
    test.equal(null, err);
    p_db.close();
    test.done();
  });
}

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyConnectWithDefaultReplicasetNoOption = function(test) {
//   // Replica configuration
//   var replSet = new ReplSetServers([
//       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
//       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
//       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
//     ]
//   );
// 
//   var db = new Db('integration_test_', replSet);
//   db.open(function(err, p_db) {
//     test.equal(null, err);
//     test.done();
//     p_db.close();
//   });
// }

/**
 * @ignore
 */
exports.shouldCorrectlyConnectWithDefaultReplicaset = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );
  test.equal(true, replSet.connectArbiter);

  var db = new Db('integration_test_', replSet);
  test.equal(true, db.serverConfig.connectArbiter);
  db.open(function(err, p_db) {
    test.equal(1, replSet.arbiters.length);
    test.equal(null, err);
    test.done();
    p_db.close();
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectWithDefaultReplicasetAndSocketOptionsSet = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {socketOptions:{keepAlive:100}}
  );

  var db = new Db('integration_test_', replSet);
  db.open(function(err, p_db) {
    test.equal(null, err);
    test.equal(100, db.serverConfig.checkoutWriter().socketOptions.keepAlive)
    test.done();
    p_db.close();
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectWithConnectArbiterFalse = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
    ],
    {connectArbiter:false}
  );
  test.equal(false, replSet.connectArbiter);

  var db = new Db('integration_test_', replSet);
  test.equal(false, db.serverConfig.connectArbiter);
  db.open(function(err, p_db) {
    test.equal(0, replSet.arbiters.length);
    test.equal(null, err);
    test.equal(false, db.serverConfig.connectArbiter);
    test.done();
    p_db.close();
  });
};

/**
 * @ignore
 */
exports.shouldEmitCloseNoCallback = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], {}
  );

  new Db('integration_test_', replSet).open(function(err, db) {
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

/**
 * @ignore
 */
exports.shouldEmitCloseWithCallback = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], {}
  );

  new Db('integration_test_', replSet).open(function(err, db) {
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

/**
 * @ignore
 */
exports.shouldCorrectlyPassErrorWhenWrongReplicaSet = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name + "-wrong"}
  );

  var db = new Db('integration_test_', replSet);
  db.open(function(err, p_db) {
    test.notEqual(null, err);
    test.done();
  })
}

/**
 * @ignore
 */
exports.shouldConnectWithPrimarySteppedDown = function(test) {
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Step down primary server
  RS.stepDownPrimary(function(err, result) {
    // Wait for new primary to pop up
    ensureConnection(test, retries, function(err, p_db) {

      new Db('integration_test_', replSet).open(function(err, p_db) {
        test.ok(err == null);
        test.equal(true, p_db.serverConfig.isConnected());

        p_db.close();
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldConnectWithThirdNodeKilled = function(test) {
  RS.getNodeFromPort(RS.ports[2], function(err, node) {
    if(err != null) debug("shouldConnectWithThirdNodeKilled :: " + inspect(err));

    RS.kill(node, function(err, result) {
      if(err != null) debug("shouldConnectWithThirdNodeKilled :: " + inspect(err));
      // Replica configuration
      var replSet = new ReplSetServers( [
          new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
        ],
        {rs_name:RS.name}
      );

      // Wait for new primary to pop up
      ensureConnection(test, retries, function(err, p_db) {
        new Db('integration_test_', replSet).open(function(err, p_db) {
          test.ok(err == null);
          test.equal(true, p_db.serverConfig.isConnected());

          p_db.close();
          test.done();
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldConnectWithSecondaryNodeKilled = function(test) {
  RS.killSecondary(function(node) {

    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ],
      {rs_name:RS.name}
    );

    var db = new Db('integration_test_', replSet);
    // Print any errors
    db.on("error", function(err) {
      console.log("============================= caught error")
      console.dir(err)
      if(err.stack != null) console.log(err.stack)
      test.done();
    })

    db.open(function(err, p_db) {
      test.ok(err == null);
      test.equal(true, p_db.serverConfig.isConnected());

      // Close and cleanup
      p_db.close();
      test.done();
    })
  });
}

/**
 * @ignore
 */
exports.shouldConnectWithPrimaryNodeKilled = function(test) {
  RS.killPrimary(function(node) {
    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ],
      {rs_name:RS.name}
    );

    var db = new Db('integration_test_', replSet);
    ensureConnection(test, retries, function(err, p_db) {
      if(err != null && err.stack != null) console.log(err.stack)
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyBeAbleToUsePortAccessors = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  var db = new Db('integration_test_', replSet);
  db.open(function(err, p_db) {
    if(err != null) debug("shouldCorrectlyBeAbleToUsePortAccessors :: " + inspect(err));
    test.equal(replSet.host, p_db.serverConfig.primary.host);
    test.equal(replSet.port, p_db.serverConfig.primary.port);

    p_db.close();
    test.done();
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnect = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Replica configuration
  var replSet2 = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  var db = new Db('integration_test_', replSet );
  db.open(function(err, p_db) {
    if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
    test.equal(true, p_db.serverConfig.isConnected());

    // Test primary
    RS.primary(function(err, primary) {
      if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));

      test.notEqual(null, primary);
      test.equal(primary, p_db.serverConfig.primary.host + ":" + p_db.serverConfig.primary.port);

      // Perform tests
      RS.secondaries(function(err, items) {
        if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));

        // Test if we have the right secondaries
        test.deepEqual(items.sort(), p_db.serverConfig.allSecondaries.map(function(item) {
                                        return item.host + ":" + item.port;
                                      }).sort());

        // Test if we have the right arbiters
        RS.arbiters(function(err, items) {
          if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));

          test.deepEqual(items.sort(), p_db.serverConfig.arbiters.map(function(item) {
                                          return item.host + ":" + item.port;
                                        }).sort());
          // Force new instance
          var db2 = new Db('integration_test_', replSet2 );
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

/**
 * @ignore
 */
exports.shouldCorrectlyEmitOpenSignalAndFullSetSignal = function(test) {
  var openCalled = false;
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  var db = new Db('integration_test_', replSet);
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
