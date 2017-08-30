'use strict';
var format = require('util').format;
var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

var restartAndDone = function(configuration, done) {
  configuration.manager.restart(9, { waitMS: 5000 }).then(function() {
    done();
  });
};

describe('ReplSet (Failover)', function() {
  before(function() {
    var configuration = this.configuration;
    return setupDatabase(configuration).then(function() {
      return configuration.manager.restart();
    });
  });

  it(
    'Should correctly remove and re-add secondary and detect removal and re-addition of the server',
    {
      metadata: { requires: { topology: 'replicaset' } },

      test: function(done) {
        var configuration = this.configuration;

        // The state
        var secondaryServerManager = null;
        var manager = configuration.manager;

        // Get a new instance
        var client = configuration.newClient({ w: 0 }, { poolSize: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);

          client.topology.on('joined', function(t, d, s) {
            if (
              t == 'secondary' &&
              secondaryServerManager &&
              s.name == f('%s:%s', secondaryServerManager.host, secondaryServerManager.port)
            ) {
              client.close();
              restartAndDone(configuration, done);
            }
          });

          client.once('fullsetup', function() {
            // Get the secondary server
            manager.secondaries().then(function(managers) {
              secondaryServerManager = managers[0];

              // Remove the secondary server
              manager
                .removeMember(secondaryServerManager, {
                  returnImmediately: false,
                  force: false,
                  skipWait: true
                })
                .then(function() {
                  setTimeout(function() {
                    // Add a new member to the set
                    manager.addMember(secondaryServerManager, {
                      returnImmediately: false,
                      force: false
                    });
                  }, 10000);
                });
            });
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should correctly handle primary stepDown', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      // The state
      var state = 0;

      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });
      client.connect(function(err, client) {
        // Wait for close event due to primary stepdown
        client.topology.on('joined', function(t) {
          if (t == 'primary') state++;
        });

        client.topology.on('left', function(t) {
          if (t == 'primary') state++;
        });

        // Wait fo rthe test to be done
        var interval = setInterval(function() {
          if (state == 2) {
            clearInterval(interval);
            client.close();
            restartAndDone(configuration, done);
          }
        }, 500);

        client.once('fullsetup', function() {
          configuration.manager
            .stepDownPrimary(false, { stepDownSecs: 1, force: true })
            .then(function() {});
        });
      });
    }
  });

  it('Should correctly recover from secondary shutdowns', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var configuration = this.configuration;
      var ReadPreference = configuration.require.ReadPreference;

      // Get a new instance
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });
      // Managers
      var managers = null;

      // Wait for a second and shutdown secondaries
      client.once('fullsetup', function() {
        configuration.manager.secondaries().then(function(m) {
          managers = m;

          // Stop bot secondaries
          managers[0]
            .stop()
            .then(function() {
              return managers[1].stop();
            })
            .then(function() {
              // Start bot secondaries
              return managers[0].start();
            })
            .then(function() {
              managers[1].start();
            });
        });
      });

      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);
        // The state
        var left = {};
        var joined = 0;

        // Wait for left events
        client.topology.on('left', function(t, s) {
          left[s.name] = { type: t, server: s };

          // Restart the servers
          if (Object.keys(left).length == 2) {
            client.topology.removeAllListeners('left');
            // Wait for close event due to primary stepdown
            client.topology.on('joined', function(t, d, s) {
              if ('secondary' == t && left[s.name]) {
                joined++;
              }

              if (joined >= Object.keys(left).length) {
                db.collection('replset_insert0').insert({ a: 1 }, function(err) {
                  test.equal(null, err);

                  db.command(
                    { ismaster: true },
                    { readPreference: new ReadPreference('secondary') },
                    function(err) {
                      test.equal(null, err);
                      client.close();
                      restartAndDone(configuration, done);
                    }
                  );
                });
              }
            });
          }
        });
      });
    }
  });

  it(
    'Should correctly remove and re-add secondary with new priority and detect removal and re-addition of the server as new new primary',
    {
      metadata: { requires: { topology: 'replicaset' } },

      test: function(done) {
        var configuration = this.configuration;
        var leftServer = null;

        // Get a new instance
        var client = configuration.newClient({ w: 0 }, { poolSize: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);

          // Add event listeners
          client.topology.on('joined', function(t, d, s) {
            if (
              t == 'primary' &&
              leftServer &&
              s.name == f('%s:%s', leftServer.host, leftServer.port)
            ) {
              client.close();
              restartAndDone(configuration, done);
            }
          });

          client.once('fullsetup', function() {
            // console.log("fullsetup")
            configuration.manager.secondaries().then(function(managers) {
              leftServer = managers[0];

              // Remove the first secondary
              configuration.manager
                .removeMember(managers[0], {
                  returnImmediately: false,
                  force: false,
                  skipWait: true
                })
                .then(function() {
                  var config = JSON.parse(JSON.stringify(configuration.manager.configurations[0]));
                  var members = config.members;
                  // Update the right configuration
                  for (var i = 0; i < members.length; i++) {
                    if (members[i].host == f('%s:%s', managers[0].host, managers[0].port)) {
                      members[i].priority = 10;
                      break;
                    }
                  }

                  // Update the version number
                  config.version = config.version + 1;

                  // Force the reconfiguration
                  configuration.manager
                    .reconfigure(config, {
                      returnImmediately: false,
                      force: false
                    })
                    .then(function() {
                      setTimeout(function() {
                        managers[0].start();
                      }, 10000);
                    });
                });
            });
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should work correctly with inserts after bringing master back', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var configuration = this.configuration;
      var ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      var manager = configuration.manager;

      // Replica configuration
      var replSet = new ReplSet(
        [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        { rs_name: configuration.replicasetName, tag: 'Application', poolSize: 1 }
      );

      // Get a new instance
      var client = new MongoClient(replSet, { w: 1 });
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);
        // Drop collection on replicaset
        db.dropCollection('shouldWorkCorrectlyWithInserts', function(err) {
          test.equal(null, err);
          var collection = db.collection('shouldWorkCorrectlyWithInserts');
          // Insert a dummy document
          collection.insert({ a: 20 }, { w: 'majority', wtimeout: 30000 }, function(err) {
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

                    for (var i = 0; i < 5; i++) {
                      collection.insert({ a: a }, { w: 2, wtimeout: 10000 }, function(err) {
                        test.equal(null, err);
                        totalCount = totalCount - 1;

                        if (totalCount == 0) {
                          callback();
                        }
                      });
                      a = a + 10;
                    }
                  }

                  inserts(function(err) {
                    test.equal(null, err);
                    // Restart the old master and wait for the sync to happen
                    primary.start().then(function() {
                      // Contains the results
                      var results = [];

                      collection.find().each(function(err, item) {
                        if (item == null) {
                          // Ensure we have the correct values
                          test.equal(6, results.length);
                          [20, 30, 40, 50, 60, 70].forEach(function(a) {
                            test.equal(
                              1,
                              results.filter(function(element) {
                                return element.a == a;
                              }).length
                            );
                          });

                          // Run second check
                          collection.save({ a: 80 }, { w: 1 }, function(err) {
                            if (err != null) {
                              console.dir(err);
                            }

                            collection.find().toArray(function(err, items) {
                              if (err != null) {
                                console.dir(err);
                              }

                              // Ensure we have the correct values
                              test.equal(7, items.length);

                              // Sort items by a
                              items = items.sort(function(a, b) {
                                return a.a > b.a;
                              });
                              // Test all items
                              test.equal(20, items[0].a);
                              test.equal(30, items[1].a);
                              test.equal(40, items[2].a);
                              test.equal(50, items[3].a);
                              test.equal(60, items[4].a);
                              test.equal(70, items[5].a);
                              test.equal(80, items[6].a);
                              client.close();
                              restartAndDone(configuration, done);
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

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly read from secondary even if primary is down', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference,
        MongoClient = configuration.require.MongoClient,
        ReplSet = mongo.ReplSet,
        Server = mongo.Server;

      var manager = configuration.manager;

      // Replica configuration
      var replSet = new ReplSet(
        [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        { rs_name: configuration.replicasetName, tag: 'Application', poolSize: 1 }
      );

      var client = new MongoClient(replSet, {
        w: 0,
        readPreference: ReadPreference.PRIMARY_PREFERRED
      });
      client.on('fullsetup', function(client) {
        var p_db = client.db(configuration.db);
        var collection = p_db.collection('notempty');

        // Insert a document
        collection.insert({ a: 1 }, { w: 2, wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          // Run a simple query
          collection.findOne(function(err, doc) {
            test.ok(err == null);
            test.ok(1, doc.a);

            // Shut down primary server
            manager.primary().then(function(primary) {
              // Stop the primary
              primary.stop().then(function() {
                // Run a simple query
                collection.findOne(function(err, doc) {
                  // test.ok(Object.keys(replSet._state.secondaries).length > 0);
                  test.equal(null, err);
                  test.ok(doc != null);

                  client.close();
                  restartAndDone(configuration, done);
                });
              });
            });
          });
        });
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldStillQuerySecondaryWhenNoPrimaryAvailable', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient,
        ReadPreference = mongo.ReadPreference;

      var manager = configuration.manager;
      var url = format(
        'mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?rs_name=%s',
        configuration.port,
        configuration.port + 1,
        configuration.port + 1,
        configuration.replicasetName
      );

      // Connect using the MongoClient
      MongoClient.connect(
        url,
        {
          replSet: {
            //set replset check interval to be much smaller than our querying interval
            haInterval: 50,
            socketOptions: {
              connectTimeoutMS: 500
            }
          }
        },
        function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.collection('replicaset_readpref_test').insert({ testfield: 123 }, function(err) {
            test.equal(null, err);

            db.collection('replicaset_readpref_test').findOne({}, function(err, result) {
              test.equal(null, err);
              test.equal(result.testfield, 123);

              // wait five seconds, then kill 2 of the 3 nodes that are up.
              setTimeout(function() {
                manager.secondaries().then(function(secondaries) {
                  secondaries[0].stop().then(function() {
                    // Shut down primary server
                    manager.primary().then(function(primary) {
                      // Stop the primary
                      primary.stop().then(function() {});
                    });
                  });
                });
              }, 5000);

              // we should be able to continue querying for a full minute
              var counter = 0;
              var intervalid = setInterval(function() {
                if (counter++ >= 30) {
                  clearInterval(intervalid);
                  client.close();
                  return restartAndDone(configuration, done);
                }

                db
                  .collection('replicaset_readpref_test')
                  .findOne({}, { readPreference: ReadPreference.SECONDARY_PREFERRED }, function(
                    err
                  ) {
                    test.equal(null, err);
                  });
              }, 1000);
            });
          });
        }
      );
    }
  });

  /**
   * @ignore
   */
  it(
    'Should get proper error when strict is set and only a secondary is available and readPreference is nearest',
    {
      metadata: { requires: { topology: 'replicaset' } },

      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          MongoClient = mongo.MongoClient,
          ReadPreference = mongo.ReadPreference;

        var manager = configuration.manager;

        var url = format(
          'mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?rs_name=%s',
          configuration.port,
          configuration.port + 1,
          configuration.port + 1,
          configuration.replicasetName
        );

        MongoClient.connect(url, { readPreference: ReadPreference.NEAREST }, function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Shut down primary server
          manager.primary().then(function(primary) {
            // Stop the primary
            primary.stop().then(function() {
              db.collection('notempty_does_not_exist', { strict: true }, function(err) {
                test.ok(err != null);
                test.ok(err.message.indexOf('Currently in strict mode') != -1);

                client.close();
                restartAndDone(configuration, done);
              });
            });
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  /*
  it('Should correctly re-execute createIndex against primary after step-down', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var configuration = this.configuration;
      // The state
      var manager = configuration.manager;

      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      client.open(function(err, client) {
        var db = client.db(configuration.db);

        db.once('fullsetup', function() {
          // Wait for close event due to primary stepdown
          client.topology.on('joined', function(t, d, s) {
            if (t == 'primary') console.log('primary joined ' + s.name);
          });

          manager.primary().then(function(primary) {
            primary.stop(9).then(function() {
              // // Execute createIndex
              // db.collection('t').createIndex({'accessControl.get': 1}, {background: true}, function(err, r) {
              //   console.dir(err)
              //   console.dir(r)

              //   test.ok(err != null);
              //   test.ok(err.message.indexOf('key accessControl.get must not contain') == -1);

              //   db.close();
              //   done();
              // });

            setTimeout(function() {
              // Execute createIndex
              db.collection('t').createIndex({'accessControl.get': 1}, {background: true}, function(err, r) {
                console.dir(err)
                console.dir(r)

                test.ok(err != null);
                test.ok(err.message.indexOf('key accessControl.get must not contain') == -1);

                db.close();
                done();
              });
            }, 100);
          });
        });
      });
    }
  });
  */
});
