"use strict";

var restartAndDone = function(configuration, test) {
  configuration.manager.restart({purge:false, kill:true}, function() {
    test.done();
  });
}

// exports.beforeTests = function(configuration, callback) {
//   configuration.restart({purge:false, kill:true}, function() {
//     callback();
//   });
// }

/**
 * @ignore
 */
exports['Should correctly read from secondary even if primary is down'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    var mongo = configuration.require
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    var manager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ]
      , {rs_name:configuration.replicasetName, tag: "Application", poolSize: 1}
    );

    var db = new Db('integration_test_', replSet, {w:0, readPreference:ReadPreference.PRIMARY_PREFERRED});
    db.on('fullsetup', function(err, p_db) {
      var collection = p_db.collection('notempty');

      // Insert a document
      collection.insert({a:1}, {w:2, wtimeout:10000}, function(err, result) {

        // Run a simple query
        collection.findOne(function (err, doc) {
          test.ok(err == null);
          test.ok(1, doc.a);

          // Shut down primary server
          manager.shutdown('primary', {signal: -15}, function (err, result) {

            // Run a simple query
            collection.findOne(function (err, doc) {
              // test.ok(Object.keys(replSet._state.secondaries).length > 0);
              test.equal(null, err);
              test.ok(doc != null);

              p_db.close();
              restartAndDone(configuration, test);
            });
          });
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

exports['Should correctly remove and re-add secondary and detect removal and re-addition of the server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    // The state
    var state = 0;
    var leftServer = null;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.serverConfig.on('joined', function(t, d, s) {
      if(t == 'secondary' && leftServer && s.name == leftServer.host) {
        db.close();
        restartAndDone(configuration, test);
      }
    });

    db.serverConfig.on('left', function(t, s) {
      if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
    });

    db.once('fullsetup', function() {
      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        leftServer = serverDetails;

        setTimeout(function() {
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});
        }, 10000)
      });
    });

    db.open(function(err, db) {
      test.equal(null, err);
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly handle primary stepDown'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    // The state
    var state = 0;

    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.once('fullsetup', function() {
      configuration.manager.stepDown({force: true}, function(err, result) {});
    });

    db.serverConfig.on('ha', function(e, options) {});
    // Wait for close event due to primary stepdown
    db.serverConfig.on('joined', function(t, d, s) {
      if(t == 'primary') state++;
    });

    db.serverConfig.on('left', function(t, s) {
      if(t == 'primary') state++;
    });

    db.open(function(err, db) {
      // Wait fo rthe test to be done
      var interval = setInterval(function() {
        if(state == 2) {
          clearInterval(interval);
          db.close();
          restartAndDone(configuration, test);
        }
      }, 500);
    });
  }
}

exports['Should correctly recover from secondary shutdowns'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    var ReadPreference = configuration.require.ReadPreference;
    // The state
    var primary = false;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // Wait for a second and shutdown secondaries
    db.once('fullsetup', function() {
      // Shutdown the first secondary
      configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
        // Shutdown the second secondary
        configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
        });
      });
    });

    // The state
    var left = {};
    var joined = 0;
    // Wait for left events
    db.serverConfig.on('left', function(t, s) {
      // console.log("-- left :: " + t + " :: " + s.name)
      left[s.name] = ({type: t, server: s});

      // Restart the servers
      if(Object.keys(left).length == 2) {
        db.serverConfig.removeAllListeners('left')
        // Wait for close event due to primary stepdown
        db.serverConfig.on('joined', function(t, d, s) {
          if('secondary' == t && left[s.name]) {
            joined++;
          }

          if(joined >= Object.keys(left).length) {
            db.collection('replset_insert0').insert({a:1}, function(err, result) {
              test.equal(null, err);

              db.command({ismaster:true}
                , {readPreference: new ReadPreference('secondary')}
                , function(err, result) {
                  test.equal(null, err);
                  db.close();
                  restartAndDone(configuration, test);
                });
            });
          }
        });

        // Let's restart a secondary
        configuration.manager.restartServer('secondary', function(err, result) {
          // Let's restart a secondary
          configuration.manager.restartServer('secondary', function(err, result) {
          });
        });
      }
    });

    db.open(function(err, db) {
      test.equal(null, err);
    });
  }
}

exports['Should correctly remove and re-add secondary with new priority and detect removal and re-addition of the server as new new primary'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    // The state
    var state = 0;
    var leftServer = null;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    // Add event listeners
    db.serverConfig.on('joined', function(t, d, s) {
      if(t == 'primary' && leftServer && s.name == leftServer.host) {
        db.close();
        restartAndDone(configuration, test);
      }
    });

    db.serverConfig.on('left', function(t, s) {
      if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
    });

    db.once('fullsetup', function() {
      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        serverDetails.priority = 10;
        leftServer = serverDetails;

        setTimeout(function() {
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});
        }, 10000)
      });
    });

    db.open(function(err, db) {
      test.equal(null, err);
    });
  }
}

/**
 * @ignore
 */
exports['Should work correctly with inserts after bringing master back'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db;

    var manager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ]
      , {rs_name:configuration.replicasetName, tag: "Application", poolSize: 1}
    );

    // Get a new instance
    var db = new Db('integration_test_', replSet, {w:1});
    db.on('fullsetup', function(err, db) {
      // Drop collection on replicaset
      db.dropCollection('shouldWorkCorrectlyWithInserts', function(err, r) {

        var collection = db.collection('shouldWorkCorrectlyWithInserts');
        // Insert a dummy document
        collection.insert({a:20}, {w:'majority', wtimeout: 30000}, function(err, r) {
          test.equal(null, err);

          // Execute a count
          collection.count(function(err, c) {
            test.equal(null, err);
            test.equal(1, c);

            // Kill the primary
            manager.shutdown('primary', {signal: -15}, function() {
              // Execute a set of inserts
              function inserts(callback) {
                var a = 30;
                var totalCount = 5;

                for(var i = 0; i < 5; i++) {
                  collection.insert({a:a}, {w:'majority', wtimeout: 10000}, function(err) {
                    totalCount = totalCount - 1;

                    if(totalCount == 0) {
                      setTimeout(function() {
                        callback();
                      }, 5000);
                    }
                  });
                  a = a + 10;
                }
              }

              inserts(function(err) {
                // Restart the old master and wait for the sync to happen
                manager.restart({purge:true, kill:true}, function(err, result) {
                  // Contains the results
                  var results = [];

                  collection.find().each(function(err, item) {
                    if(item == null) {
                      // Ensure we have the correct values
                      test.equal(6, results.length);
                      [20, 30, 40, 50, 60, 70].forEach(function(a) {
                        test.equal(1, results.filter(function(element) {
                          return element.a == a;
                        }).length);
                      });

                      // Run second check
                      collection.save({a:80}, {w:1}, function(err, r) {
                        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));

                        collection.find().toArray(function(err, items) {
                          if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));

                          // Ensure we have the correct values
                          test.equal(7, items.length);

                          // Sort items by a
                          items = items.sort(function(a,b) { return a.a > b.a});
                          // Test all items
                          test.equal(20, items[0].a);
                          test.equal(30, items[1].a);
                          test.equal(40, items[2].a);
                          test.equal(50, items[3].a);
                          test.equal(60, items[4].a);
                          test.equal(70, items[5].a);
                          test.equal(80, items[6].a);
                          db.close();
                          restartAndDone(configuration, test);
                        });
                      });
                    } else {
                      results.push(item);
                    }
                  });
                })
              })
            });
          });
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}
