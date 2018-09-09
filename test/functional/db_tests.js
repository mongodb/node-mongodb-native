'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Db', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleIllegalDbNames', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Db = configuration.require.Db;

      // Assert rename
      try {
        new Db(5);
      } catch (err) {
        test.ok(err instanceof Error);
        test.equal('database name must be a string', err.message);
      }

      try {
        new Db('');
      } catch (err) {
        test.ok(err instanceof Error);
        test.equal('database name cannot be the empty string', err.message);
      }

      try {
        new Db('te$t', function() {});
      } catch (err) {
        test.equal("database names cannot contain the character '$'", err.message);
      }

      try {
        new Db('.test', function() {});
      } catch (err) {
        test.equal("database names cannot contain the character '.'", err.message);
      }

      try {
        new Db('\\test', function() {});
      } catch (err) {
        test.equal("database names cannot contain the character '\\'", err.message);
      }

      try {
        new Db('\\test', function() {});
      } catch (err) {
        test.equal("database names cannot contain the character '\\'", err.message);
      }

      try {
        new Db('test test', function() {});
      } catch (err) {
        test.equal("database names cannot contain the character ' '", err.message);
      }

      done();
    }
  });

  /**
   * @ignore
   */
  it('should not call callback twice on collection() with callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: true
      });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);
        var count = 0;

        var coll = db.collection('coll_name', function(e) {
          test.equal(null, e);
          count = count + 1;
        });

        try {
          coll.findOne({}, null, function() {
            //e - errors b/c findOne needs a query selector
            test.equal(1, count);
            client.close();
            done();
          });
        } catch (e) {
          process.nextTick(function() {
            test.equal(1, count);
            client.close();
            done();
          });
        }
      });
    }
  });

  /**
   * @ignore
   */
  it('should callback with an error only when a MongoError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      let configuration = this.configuration;
      let client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: true
      });

      client.connect(function(err, client) {
        let callbackCalled = 0;
        test.equal(null, err);
        let db = client.db(configuration.db);

        try {
          db.collection('collectionCallbackTest', function(e) {
            callbackCalled++;
            test.equal(null, e);
            throw new Error('Erroring on purpose with a non MongoError');
          });
        } catch (e) {
          test.equal(callbackCalled, 1);
          done();
        }
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformAutomaticConnect', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology deprecates autoReconnect
        return this.skip();
      }

      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: true
      });

      client.connect(function(err, client) {
        var automatic_connect_client = client.db(configuration.db);

        var closeListener = function() {
          var collection = automatic_connect_client.collection('test_object_id_generation_data2');
          collection.insert({ name: 'Patty', age: 34 }, configuration.writeConcernMax(), function(
            err,
            r
          ) {
            test.equal(1, r.ops.length);
            test.ok(r.ops[0]._id.toHexString().length === 24);

            collection.findOne({ name: 'Patty' }, function(err, document) {
              test.equal(r.ops[0]._id.toHexString(), document._id.toHexString());
              client.close();
              done();
            });
          });
        };

        automatic_connect_client.once('close', closeListener);
        automatic_connect_client.serverConfig.connections()[0].destroy();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformAutomaticConnectWithMaxBufferSize0', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology does not use a store
        return this.skip();
      }

      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: true, bufferMaxEntries: 0 }
      );

      client.connect(function(err, client) {
        var automatic_connect_client = client.db(configuration.db);

        var closeListener = function() {
          var collection = automatic_connect_client.collection('test_object_id_generation_data2');
          collection.insert({ name: 'Patty', age: 34 }, configuration.writeConcernMax(), function(
            err
          ) {
            test.ok(err != null);
            test.ok(err.message.indexOf('0') !== -1);
            client.close();
            done();
          });
        };

        automatic_connect_client.once('close', closeListener);
        automatic_connect_client.serverConfig.connections()[0].destroy();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleFailedConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var fs_client = configuration.newClient('mongodb://127.0.0.1:25117/test', {
        auto_reconnect: false
      });

      fs_client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyResaveDBRef', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var DBRef = configuration.require.DBRef;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.dropCollection('test_resave_dbref', function() {
          test.equal(null, err);

          db.createCollection('test_resave_dbref', function(err, collection) {
            test.equal(null, err);

            collection.insert({ name: 'parent' }, { safe: true }, function(err, r) {
              test.equal(null, err);
              test.ok(r.ops.length === 1 && r.ops[0]._id != null);
              var parent = r.ops[0];
              var child = { name: 'child', parent: new DBRef('test_resave_dbref', parent._id) };

              collection.insert(child, { safe: true }, function(err) {
                test.equal(null, err);

                collection.findOne({ name: 'child' }, function(err, child) {
                  //Child deserialized
                  test.ok(child != null);

                  collection.save(child, { save: true }, function(err) {
                    test.equal(null, err);

                    collection.findOne(
                      { parent: new DBRef('test_resave_dbref', parent._id) },
                      function(err, child) {
                        test.ok(child != null); //!!!! Main test point!
                        client.close();
                        done();
                      }
                    );
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * An example showing how to force a reindex of a collection.
   */
  it('shouldCorrectlyForceReindexOnCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      // Establish connection to db
      client.connect(function(err, client) {
        var db = client.db('integration_tests');

        // Create a collection we want to drop later
        db.createCollection('create_and_drop_all_indexes', function(err, collection) {
          test.equal(null, err);

          // Insert a bunch of documents for the index
          collection.insert(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Create an index on the a field
              collection.ensureIndex(
                { a: 1, b: 1 },
                { unique: true, background: true, w: 1 },
                function(err) {
                  test.equal(null, err);

                  // Force a reindex of the collection
                  collection.reIndex(function(err, result) {
                    test.equal(null, err);
                    test.equal(true, result);

                    // Verify that the index is gone
                    collection.indexInformation(function(err, indexInformation) {
                      test.deepEqual([['_id', 1]], indexInformation._id_);
                      test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

                      client.close();
                      done();
                    });
                  });
                }
              );
            }
          );
        });
      });
      // DOC_END
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyGetErrorDroppingNonExistingDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var _db = client.db('nonexistingdb');

        _db.dropDatabase(function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyThrowWhenTryingToReOpenConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        try {
          client.connect(function() {});
          test.ok(false);
        } catch (err) {
          client.close();
          done();
        }
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReconnectWhenError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(`mongodb://127.0.0.1:27088/test`, {
        auto_reconnect: false,
        poolSize: 4
      });

      // Establish connection to db
      client.connect(function(err) {
        test.ok(err != null);

        client.connect(function(err) {
          test.ok(err != null);
          client.close();
          done();
        });
      });
    }
  });

  it('should not cut collection name when it is the same as the database', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db1 = client.db('node972');
        db1.collection('node972.test').insertOne({ a: 1 }, function(err) {
          test.equal(null, err);

          db1.collections(function(err, collections) {
            test.equal(null, err);
            collections = collections.map(function(c) {
              return c.collectionName;
            });
            test.notEqual(-1, collections.indexOf('node972.test'));
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyUseCursorWithListCollectionsCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommand');

        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function(err) {
          test.equal(null, err);

          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function() {
            test.equal(null, err);

            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: 'test1' });
            cursor.toArray(function(err, names) {
              test.equal(null, err);
              test.equal(1, names.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize');

        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function(err) {
          test.equal(null, err);

          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function() {
            test.equal(null, err);

            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: 'test' }, { batchSize: 1 });
            cursor.toArray(function(err, names) {
              test.equal(null, err);
              test.equal(1, names.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly list collection names with . in the middle', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThem');

        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function(err) {
          test.equal(null, err);

          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function() {
            test.equal(null, err);

            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: /test.collection/ });
            cursor.toArray(function(err, names) {
              test.equal(null, err);
              test.equal(2, names.length);

              // Get listCollections filtering out the name
              var cursor = db1.listCollections({ name: 'test.collection1' }, {});
              cursor.toArray(function(err, names) {
                test.equal(null, err);
                test.equal(1, names.length);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly list collection names with batchSize 1 for 2.8 or higher', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>= 2.8.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThemFor28');

        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function(err) {
          test.equal(null, err);

          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function() {
            test.equal(null, err);

            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: /test.collection/ }, { batchSize: 1 });
            cursor.toArray(function(err, names) {
              test.equal(null, err);
              test.equal(2, names.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly execute close function in order', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>= 2.8.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var items = [];

        items.push(1);
        client.close(function() {
          test.equal(2, items.length);
          done();
        });
        items.push(2);
      });
    }
  });
});
