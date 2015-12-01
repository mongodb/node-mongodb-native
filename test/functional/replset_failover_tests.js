"use strict";

var format = require('util').format,
  f = require('util').format;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart().then(function() {
    test.done();
  });
}

exports.beforeTests = function(configuration, callback) {
  configuration.manager.restart().then(function() {
    callback();
  });
}

exports['Should correctly remove and re-add secondary and detect removal and re-addition of the server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    // The state
    var state = 0;
    var secondaryServerManager = null;
    var manager = configuration.manager;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.serverConfig.on('joined', function(t, d, s) {
        if(t == 'secondary'
          && secondaryServerManager
          && s.name == f('%s:%s', secondaryServerManager.host, secondaryServerManager.port)) {
            db.close();
            restartAndDone(configuration, test);
        }
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'secondary'
          && secondaryServerManager
          && s.name == f('%s:%s', secondaryServerManager.host, secondaryServerManager.port)) {
            state++;
        }
      });

      db.once('fullsetup', function() {
        // Get the secondary server
        manager.secondaries().then(function(managers) {
          secondaryServerManager = managers[0];

          // Remove the secondary server
          manager.removeMember(secondaryServerManager, {
            returnImmediately: false, force: false, skipWait:true
          }).then(function() {
            setTimeout(function() {
              // Add a new member to the set
              manager.addMember(secondaryServerManager, {
                returnImmediately: false, force:false
              }).then(function(x) {
              });
            }, 10000)
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly receive ha'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.serverConfig.on('ha', function(e, options) {
        db.close();
        restartAndDone(configuration, test);
      });
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
    db.open(function(err, db) {
      db.serverConfig.on('ha', function(e, options) {});
      // Wait for close event due to primary stepdown
      db.serverConfig.on('joined', function(t, d, s) {
        if(t == 'primary') state++;
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'primary') state++;
      });

      // Wait fo rthe test to be done
      var interval = setInterval(function() {
        if(state == 2) {
          clearInterval(interval);
          db.close();
          restartAndDone(configuration, test);
        }
      }, 500);

      db.once('fullsetup', function() {
        configuration.manager.stepDownPrimary(false, {stepDownSecs: 1, force:true}).then(function() {});
      });
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
    // Managers
    var managers = null;

    // Wait for a second and shutdown secondaries
    db.once('fullsetup', function() {
      configuration.manager.secondaries().then(function(m) {
        managers = m;

        // Stop bot secondaries
        managers[0].stop().then(function() {
          managers[1].stop().then(function() {
            // Start bot secondaries
            managers[0].start().then(function() {
              managers[1].start().then(function() {
              });
            });
          });
        });
      });
    });

    db.open(function(err, db) {
      test.equal(null, err);
      // The state
      var left = {};
      var joined = 0;

      // Wait for left events
      db.serverConfig.on('left', function(t, s) {
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
        }
      });
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
    db.open(function(err, db) {
      test.equal(null, err);

      // Add event listeners
      db.serverConfig.on('joined', function(t, d, s) {
        if(t == 'primary' && leftServer && s.name == f('%s:%s', leftServer.host, leftServer.port)) {
          db.close();
          restartAndDone(configuration, test);
        }
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == f('%s:%s', leftServer.host, leftServer.port)) state++;
      });

      db.once('fullsetup', function() {
        configuration.manager.secondaries().then(function(managers) {
          leftServer = managers[0];

          // Remove the first secondary
          configuration.manager.removeMember(managers[0], {
            returnImmediately: false, force: false, skipWait:true
          }).then(function() {
            var config = JSON.parse(JSON.stringify(configuration.manager.configurations[0]));
            var members = config.members;
            // Update the right configuration
            for(var i = 0; i < members.length; i++) {
              if(members[i].host == f('%s:%s', managers[0].host, managers[0].port)) {
                members[i].priority = 10;
                break;
              }
            }

            // Update the version number
            config.version = config.version + 1;

            // Force the reconfiguration
            configuration.manager.reconfigure(config, {
              returnImmediately:false, force:false
            }).then(function() {
              setTimeout(function() {
                managers[0].start().then(function() {
                });
              }, 10000)
            })
          });
        });
      });
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

            manager.primary().then(function(primary) {

              primary.stop().then(function() {

                // Execute a set of inserts
                function inserts(callback) {
                  var a = 30;
                  var totalCount = 5;

                  for(var i = 0; i < 5; i++) {
                    collection.insert({a:a}, {w:2, wtimeout: 10000}, function(err) {
                      totalCount = totalCount - 1;

                      if(totalCount == 0) {
                        callback();
                      }
                    });
                    a = a + 10;
                  }
                }

                inserts(function(err) {
                  // Restart the old master and wait for the sync to happen
                  primary.start().then(function(result) {
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
                  });
                });
              });
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
          manager.primary().then(function(primary) {

            // Stop the primary
            primary.stop().then(function() {

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
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['shouldStillQuerySecondaryWhenNoPrimaryAvailable'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference;

    var manager = configuration.manager;
    var url = format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?rs_name=%s"
      , configuration.port, configuration.port + 1, configuration.port + 1, configuration.replicasetName);

    // Connect using the MongoClient
    MongoClient.connect(url, {
        replSet: {
          //set replset check interval to be much smaller than our querying interval
          haInterval: 50,
          socketOptions: {
            connectTimeoutMS: 500
          }
        }
      }, function(err,db){
        test.equal(null, err);
        test.ok(db != null);

        db.collection("replicaset_readpref_test").insert({testfield:123}, function(err, result) {
          test.equal(null, err);

          db.collection("replicaset_readpref_test").findOne({}, function(err, result){
            test.equal(null, err);
            test.equal(result.testfield, 123);

            // wait five seconds, then kill 2 of the 3 nodes that are up.
            setTimeout(function(){
              manager.secondaries().then(function(secondaries) {
                secondaries[0].stop().then(function() {
                  // Shut down primary server
                  manager.primary().then(function(primary) {
                    // Stop the primary
                    primary.stop().then(function() {
                    });
                  });
                });
              });
            }, 5000);

            // we should be able to continue querying for a full minute
            var counter = 0;
            var callbacksWaiting = 0;
            var intervalid = setInterval(function() {
              if(counter++ >= 30){
                clearInterval(intervalid);
                db.close();
                return restartAndDone(configuration, test);
              }

              callbacksWaiting++;

              db.collection("replicaset_readpref_test").findOne({},
                {readPreference: ReadPreference.SECONDARY_PREFERRED},
                function(err, result) {
                  callbacksWaiting--;
              });
            }, 1000);
          });
        });
      });
  }
}
