'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const { Db, DBRef } = require('../../src');

describe('Db', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('shouldCorrectlyHandleIllegalDbNames', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
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

  it('should not call callback twice on collection() with callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

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
            client.close(done);
          });
        } catch (e) {
          process.nextTick(function() {
            test.equal(1, count);
            client.close(done);
          });
        }
      });
    }
  });

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
          client.close(done);
        }
      });
    }
  });

  it('shouldCorrectlyHandleFailedConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var fs_client = configuration.newClient('mongodb://127.0.0.1:25117/test', {
        auto_reconnect: false,
        serverSelectionTimeoutMS: 10
      });

      fs_client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  it('shouldCorrectlyResaveDBRef', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
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
                        client.close(done);
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

  it('shouldCorrectlyGetErrorDroppingNonExistingDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var _db = client.db('nonexistingdb');

        _db.dropDatabase(function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          client.close(done);
        });
      });
    }
  });

  it.skip('shouldCorrectlyThrowWhenTryingToReOpenConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(err => {
        expect(err).to.not.exist;

        try {
          client.connect(function() {});
          test.ok(false);
        } catch (err) {
          client.close(done);
        }
      });
    }
  });

  it('shouldCorrectlyReconnectWhenError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(`mongodb://127.0.0.1:27088/test`, {
        auto_reconnect: false,
        poolSize: 4,
        serverSelectionTimeoutMS: 10
      });

      // Establish connection to db
      client.connect(function(err) {
        test.ok(err != null);

        client.connect(function(err) {
          test.ok(err != null);
          client.close(done);
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
            client.close(done);
          });
        });
      });
    }
  });

  it('shouldCorrectlyUseCursorWithListCollectionsCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

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

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

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

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('should correctly list collection names with . in the middle', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

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

                client.close(done);
              });
            });
          });
        });
      });
    }
  });

  it('should correctly list collection names with batchSize 1 for 2.8 or higher', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>= 2.8.0'
      }
    },

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

              client.close(done);
            });
          });
        });
      });
    }
  });
});
