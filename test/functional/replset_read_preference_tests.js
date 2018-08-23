'use strict';

var format = require('util').format;
var fs = require('fs');
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

var restartAndDone = function(done) {
  done();
};

function filterSecondaries(hosts, isMaster) {
  return hosts.reduce((secondaries, host) => {
    if (isMaster.primary !== host && isMaster.arbiters && isMaster.arbiters.indexOf(host) === -1) {
      secondaries[host] = host;
    }
  }, {});
}

// NOTE: skipped because they haven't worked in some time, need refactoring
describe.skip('ReplSet (ReadPreference)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should Correctly Pick lowest ping time', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration.newClient(
        {},
        { secondaryAcceptableLatencyMS: 5, debug: true, w: 1 }
      );

      // Trigger test once whole set is up
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);

        db.command({ ismaster: true }, function(err, result) {
          test.equal(null, err);

          var time = 10;

          // // Nearest strategy
          // var nearest = client.topology.replset.readPreferenceStrategies['nearest'];

          // Sorted by time
          var byTime = [];
          byTime = client.topology.replset.getServers({ ignoreArbiters: true });
          byTime.forEach(function(s) {
            s.lastIsMasterMS = time;
            time = time + 10;
          });

          // // Set the ping times
          // var keys = Object.keys(nearest.data);
          // for(var i = 0; i < keys.length; i++) {
          //   nearest.data[keys[i]] = time;
          //   if(keys[i] != result.primary)
          //     byTime.push(keys[i]);
          //   time += 10;
          // }

          // // Set primary to the highest ping time
          // nearest.data[result.primary] = time;
          // byTime.push(result.primary);
          //

          var hosts = result.hosts.concat(result.passives || []);
          var secondaries = filterSecondaries(hosts, result);

          // // Last server picked
          // var lastServer = null;

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.equal(byTime[0].name, server.name);
          });

          // Attempt to perform a read
          db
            .collection('somecollection')
            .findOne({}, { readPreference: new ReadPreference(ReadPreference.NEAREST) }, function(
              err
            ) {
              test.equal(null, err);

              // Pick the server
              client.topology.replset.once('pickedServer', function(readPreference, server) {
                test.ok(secondaries.indexOf(server.name) !== -1);
              });

              // Attempt to perform a read
              db
                .collection('somecollection')
                .findOne(
                  {},
                  { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
                  function(err) {
                    test.equal(null, err);

                    // Pick the server
                    client.topology.replset.once('pickedServer', function(readPreference, server) {
                      test.ok(secondaries.indexOf(server.name) !== -1);
                    });

                    // Attempt to perform a read
                    db
                      .collection('somecollection')
                      .findOne(
                        {},
                        { readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED) },
                        function(err) {
                          test.equal(null, err);

                          // Pick the server
                          client.topology.replset.once('pickedServer', function(
                            readPreference,
                            server
                          ) {
                            test.equal('localhost:31000', server.name);
                          });

                          // Attempt to perform a read
                          db
                            .collection('somecollection')
                            .findOne(
                              {},
                              { readPreference: new ReadPreference(ReadPreference.PRIMARY) },
                              function(err) {
                                test.equal(null, err);

                                // Close db
                                client.close();
                                restartAndDone(done);
                              }
                            );
                        }
                      );
                  }
                );
            });
        });
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  it('Should Correctly vary read server when using readpreference NEAREST', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration.newClient(
        {},
        { w: 1, readPreference: ReadPreference.NEAREST, debug: true }
      );

      client.on('fullsetup', function() {
        var db = client.db(configuration.db);
        // Servers viewed
        var viewedServers = {};

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          viewedServers[server.name] = server.name;
        });

        db.collection('nearest_collection_test').findOne({ a: 1 }, function(err) {
          test.equal(null, err);

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            viewedServers[server.name] = server.name;
          });

          db.collection('nearest_collection_test').findOne({ a: 1 }, function(err) {
            test.equal(null, err);

            // Pick the server
            client.topology.replset.once('pickedServer', function(readPreference, server) {
              viewedServers[server.name] = server.name;
            });

            db.collection('nearest_collection_test').findOne({ a: 1 }, function(err) {
              test.equal(null, err);
              test.ok(Object.keys(viewedServers).length > 1);

              client.close();
              restartAndDone(done);
            });
          });
        });
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  it(
    'Should Correctly vary read server when using readpreference NEAREST passed at collection level',
    {
      metadata: { requires: { topology: 'replicaset' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          ReadPreference = mongo.ReadPreference;

        // Open the database
        var client = configuration.newClient(
          {},
          { w: 1, readPreference: ReadPreference.NEAREST, debug: true }
        );

        client.on('fullsetup', function() {
          var db = client.db(configuration.db);
          // Servers viewed
          var viewedServers = {};

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            viewedServers[server.name] = server.name;
          });

          db
            .collection('nearest_collection_test', {
              readPreference: 'nearest'
            })
            .findOne({ a: 1 }, function(err) {
              test.equal(null, err);

              // Pick the server
              client.topology.replset.once('pickedServer', function(readPreference, server) {
                viewedServers[server.name] = server.name;
              });

              db
                .collection('nearest_collection_test', {
                  readPreference: 'nearest'
                })
                .findOne({ a: 1 }, function(err) {
                  test.equal(null, err);

                  // Pick the server
                  client.topology.replset.once('pickedServer', function(readPreference, server) {
                    viewedServers[server.name] = server.name;
                  });

                  db
                    .collection('nearest_collection_test', {
                      readPreference: 'nearest'
                    })
                    .findOne({ a: 1 }, function(err) {
                      test.equal(null, err);
                      test.ok(Object.keys(viewedServers).length > 1);

                      client.close();
                      restartAndDone(done);
                    });
                });
            });
        });

        client.connect(function(err) {
          test.equal(null, err);
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('shouldCorrectlyReadFromGridstoreWithSecondaryReadPreference', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID,
        ReadPreference = configuration.require.ReadPreference;

      // Create an id
      var id = new ObjectID();
      // Open the database
      var client = configuration.newClient(
        {},
        {
          w: 1,
          readPreference: ReadPreference.NEAREST,
          debug: true
        }
      );

      client.on('fullsetup', function() {
        var db = client.db(configuration.db);

        db.command({ ismaster: true }, function(err, result) {
          test.equal(null, err);

          var gridStore = new GridStore(db, id, 'w', { w: 4 });
          var secondaries = filterSecondaries(result.hosts, result);

          // Force multiple chunks to be stored
          gridStore.chunkSize = 5000;
          var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

          gridStore.open(function(err, gridStore) {
            test.equal(null, err);

            // Write the file using write
            gridStore.write(data, function(err) {
              test.equal(null, err);

              gridStore.close(function(err, doc) {
                test.equal(null, err);

                // Pick the server
                client.topology.replset.once('pickedServer', function(readPreference, server) {
                  test.ok(secondaries[server.name] != null);
                });

                // Read the file using readBuffer
                new GridStore(db, doc._id, 'r', {
                  readPreference: ReadPreference.SECONDARY
                }).open(function(err, gridStore) {
                  test.equal(null, err);

                  gridStore.read(function(err, data2) {
                    test.equal(null, err);
                    test.equal(data.toString('base64'), data2.toString('base64'));
                    client.close();
                    restartAndDone(done);
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
  it('Connection to replicaset with primary read preference', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Create db instance
      var client = configuration.newClient(
        {},
        { w: 0, readPreference: ReadPreference.PRIMARY, debug: true }
      );

      // Logger.setLevel('info');
      // Trigger test once whole set is up
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);

        db.command({ ismaster: true }, function(err, result) {
          test.equal(null, err);

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.equal(result.primary, server.name);
          });

          // Grab the collection
          var collection = db.collection('read_preference_replicaset_test_0');
          // Attempt to read (should fail due to the server not being a primary);
          collection.find().toArray(function(err) {
            test.equal(null, err);
            client.close();
            restartAndDone(done);
          });
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Set read preference at collection level using collection method', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Create db instance
      var client = configuration.newClient({}, { w: 0, debug: true });
      // Connect to the db
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          test.equal(null, err);

          // Filter out the secondaries
          var secondaries = filterSecondaries(result.hosts, result);

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries[server.name] != null);
          });

          // Grab the collection
          var collection = db.collection('read_preferences_all_levels_0', {
            readPreference: ReadPreference.SECONDARY
          });
          // Attempt to read (should fail due to the server not being a primary);
          var cursor = collection.find();
          cursor.toArray(function(err) {
            test.equal(null, err);
            test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
            client.close();
            restartAndDone(done);
          });
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Set read preference at collection level using createCollection method', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Create db instance
      var client = configuration.newClient({}, { w: 0, debug: true });
      // Connect to the db
      client.on('fullsetup', function() {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          // Filter out the secondaries
          var secondaries = filterSecondaries(result.hosts, result);

          // Grab the collection
          db.createCollection(
            'read_preferences_all_levels_1',
            { readPreference: ReadPreference.SECONDARY },
            function(err, collection) {
              test.equal(null, err);

              // Pick the server
              client.topology.replset.once('pickedServer', function(readPreference, server) {
                test.ok(secondaries[server.name] != null);
              });

              var cursor = collection.find();
              // Attempt to read (should fail due to the server not being a primary);
              cursor.toArray(function(err) {
                test.equal(null, err);
                // Does not get called or we don't care
                test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
                client.close();
                restartAndDone(done);
              });
            }
          );
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Set read preference at cursor level', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Create db instance
      var client = configuration.newClient({}, { w: 0, debug: true });
      // Connect to the db
      client.on('fullsetup', function() {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          // Filter out the secondaries
          var secondaries = filterSecondaries(result.hosts, result);

          // Grab the collection
          var collection = db.collection('read_preferences_all_levels_1');

          // Pick the server
          client.topology.replset.once('pickedServer', function() {
            client.topology.replset.once('pickedServer', function(readPreference, server) {
              test.ok(secondaries[server.name] != null);
            });
          });

          // Attempt to read (should fail due to the server not being a primary);
          collection
            .find()
            .setReadPreference(ReadPreference.SECONDARY)
            .toArray(function(err) {
              test.equal(null, err);
              client.close();
              restartAndDone(done);
            });
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Attempt to change read preference at cursor level after object read legacy', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      const client = configuration.newClient({}, { w: 0, debug: true });
      // Connect to the db
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Grab the collection
        var collection = db.collection('read_preferences_all_levels_2');
        // Insert a bunch of documents
        collection.insert([{ a: 1 }, { b: 1 }, { c: 1 }], { w: 1 }, function(err) {
          test.equal(null, err);

          // Set up cursor
          var cursor = collection.find().setReadPreference(ReadPreference.SECONDARY);
          cursor.each(function(err, result) {
            if (result == null) {
              client.close();
              restartAndDone(done);
            } else {
              try {
                // Try to change the read preference it should not work as the query was executed
                cursor.setReadPreference(ReadPreference.PRIMARY);
                test.ok(false);
              } catch (err) {
                test.ok(err != null);
              }

              test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Set read preference at db level', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      const client = configuration.newClient(
        {},
        { w: 0, debug: true, readPreference: new ReadPreference(ReadPreference.SECONDARY) }
      );

      // Connect to the db
      client.on('fullsetup', function() {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          // Filter out the secondaries
          var hosts = result.hosts.concat(result.passives || []);
          var secondaries = filterSecondaries(hosts, result);

          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries[server.name] != null);
          });

          // Grab the collection
          var collection = db.collection('read_preferences_all_levels_2');
          // Attempt to read (should fail due to the server not being a primary);
          var cursor = collection.find();
          cursor.toArray(function(err) {
            test.equal(null, err);
            // Does not get called or we don't care
            test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
            client.close();
            restartAndDone(done);
          });
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Set read preference at collection level using collection method', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      const client = configuration.newClient({}, { w: 0, debug: true, haInterval: 100 });

      // Connect to the db
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          // Filter out the secondaries
          var secondaries = filterSecondaries(result.hosts, result);

          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries[server.name] != null);
          });

          // Grab the collection
          var collection = db.collection('read_preferences_all_levels_3', {
            readPreference: new ReadPreference(ReadPreference.SECONDARY)
          });

          // Attempt to read (should fail due to the server not being a primary);
          var cursor = collection.find();
          cursor.toArray(function(err) {
            test.equal(null, err);
            // Does not get called or we don't care
            test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
            client.close();
            restartAndDone(done);
          });
        });
      });

      // Connect to the db
      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Ensure tag read goes only to the correct server', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration.newClient(
        {},
        {
          w: 0,
          debug: true,
          readPreference: new ReadPreference(ReadPreference.SECONDARY, { loc: 'ny' })
        }
      );

      // Trigger test once whole set is up
      client.on('fullsetup', function() {
        client.topology.replset.once('pickedServer', function(readPreference) {
          test.equal('secondary', readPreference.preference);
          test.equal('ny', readPreference.tags['loc']);
        });

        client
          .db('local')
          .collection('system.replset')
          .find()
          .toArray(function(err) {
            test.equal(null, err);
            client.close();
            restartAndDone(done);
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
  it('Ensure tag read goes only to the correct servers using nearest', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration(
        {},
        {
          w: 1,
          debug: true,
          readPreference: new ReadPreference(ReadPreference.NEAREST, { loc: 'ny' })
        }
      );

      var success = false;
      // Trigger test once whole set is up
      client.on('fullsetup', function(client) {
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          test.equal('ny', server.lastIsMaster().tags.loc);
          // Mark success
          success = true;
        });

        client
          .db('local')
          .collection('system.replset')
          .find()
          .toArray(function(err) {
            test.equal(null, err);
            test.ok(success);
            client.close();
            restartAndDone(done);
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
  it('Always uses primary readPreference for findAndModify', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration.newClient(
        {},
        {
          w: 0,
          readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED)
        }
      );

      // Trigger test once whole set is up
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);
        db.collection('test').findAndModify({}, {}, { upsert: false }, function(err) {
          test.equal(null, err);
          client.close();
          restartAndDone(done);
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
  it('should correctly apply read preference for direct secondary connection', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        Server = mongo.Server,
        ReadPreference = mongo.ReadPreference;

      // Open the database
      const client = configuration.newClient({
        w: 'majority',
        wtimeout: 10000,
        readPreference: ReadPreference.NEAREST
      });

      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);

        db
          .collection('direct_secondary_read_test')
          .insertMany(
            [{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              client.close();

              setTimeout(function() {
                var url = format(
                  'mongodb://localhost:%s/integration_test_?readPreference=nearest',
                  configuration.port + 1
                );

                // Connect using the MongoClient
                const client2 = configuration.newClient(url);
                client2.connect(url, function(err, client2) {
                  test.equal(null, err);
                  var db = client2.db(configuration.db);
                  test.ok(client2.topology instanceof Server);

                  db.collection('direct_secondary_read_test').count(function(err, n) {
                    test.equal(null, err);
                    test.ok(n > 0);

                    client2.close();
                    done();
                  });
                });
              }, 1000);
            }
          );
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  /*
  it('should correctly list Collections on secondary', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient;

      // var url = format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?slaveOk=true&rs_name=%s"
      //   , configuration.port, configuration.port + 1, configuration.port + 1, configuration.replicasetName);
      var url = format('mongodb://localhost:%s/integration_test_?slaveOk=true', configuration.port);

      // Connect using the MongoClient
      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        test.ok(client != null);

        var db = client.db(configuration.db);
        db.collection('replicaset_slave_ok').insert({ testfield: 123 }, function(err) {
          test.equal(null, err);

          db.listCollections().toArray(function(err) {
            test.equal(null, err);
            client.close();
            done();
          });
        });
      });
    }
  });
  */
});
