'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe.skip('Errors', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('shouldFailInsertDueToUniqueIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_failing_insert_due_to_unique_index');
        collection.ensureIndex([['a', 1]], { unique: true, w: 1 }, function(err) {
          test.equal(null, err);

          collection.insert({ a: 2 }, { w: 1 }, function(err) {
            test.ok(err == null);

            collection.insert({ a: 2 }, { w: 1 }, function(err) {
              test.ok(err.code != null);
              test.ok(err != null);
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  // Test the error reporting functionality
  it('shouldFailInsertDueToUniqueIndexStrict', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.dropCollection('test_failing_insert_due_to_unique_index_strict', function() {
          db.createCollection('test_failing_insert_due_to_unique_index_strict', function(err) {
            test.equal(null, err);
            db.collection('test_failing_insert_due_to_unique_index_strict', function(
              err,
              collection
            ) {
              collection.ensureIndex([['a', 1]], { unique: true, w: 1 }, function(err) {
                test.equal(null, err);
                collection.insert({ a: 2 }, { w: 1 }, function(err) {
                  test.ok(err == null);

                  collection.insert({ a: 2 }, { w: 1 }, function(err) {
                    test.ok(err != null);
                    client.close();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  it('mixing included and excluded fields should return an error object with message', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var c = db.collection('test_error_object_should_include_message');
        c.insert({ a: 2, b: 5 }, { w: 1 }, function(err) {
          test.equal(err, null);

          c.findOne({ a: 2 }, { fields: { a: 1, b: 0 } }, function(err) {
            test.ok(err != null);
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should handle error throw in user callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      process.once('uncaughtException', function(err) {
        test.ok(err !== null);
        client.close();
        done();
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var c = db.collection('test_error_object_should_include_message');
        c.findOne({}, function() {
          ggg; // eslint-disable-line
        });
      });
    }
  });

  it('should handle error throw in user callbackwhen calling count', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      process.once('uncaughtException', function(err) {
        test.ok(err !== null);
        client.close();
        done();
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var c = db.collection('test_error_object_should_include_message');
        c.find({}).count(function() {
          ggg; // eslint-disable-line
        });
      });
    }
  });

  it('Should handle uncaught error correctly', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      process.once('uncaughtException', function(err) {
        test.ok(err !== null);
        client.close();
        done();
      });

      client.connect(function() {
        testdfdma(); // eslint-disable-line
        test.ok(false);
      });
    }
  });

  it('Should handle throw error in db operation correctly', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        process.once('uncaughtException', function(err) {
          test.ok(err !== null);
          client.close();
          done();
        });

        db.collection('t').findOne(function() {
          testdfdma(); // eslint-disable-line
        });
      });
    }
  });

  it('Should handle MongoClient uncaught error correctly', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        node: '>0.10.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var domain = require('domain');
      var d = domain.create();
      d.on('error', function(err) {
        test.ok(err !== null);
        d.dispose();
        done();
      });

      d.run(function() {
        MongoClient.connect(configuration.url(), function() {
          testdfdma(); // eslint-disable-line
          test.ok(false);
        });
      });
    }
  });

  it('Should handle MongoClient throw error in db operation correctly', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      MongoClient.connect(configuration.url(), { server: { sslValidate: false } }, function(
        err,
        client
      ) {
        var db = client.db(configuration.db);

        process.once('uncaughtException', function(err) {
          test.ok(err !== null);
          client.close();
          done();
        });

        db.collection('t').findOne(function() {
          testdfdma(); // eslint-disable-line
        });
      });
    }
  });

  it('Should handle Error thrown during operation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        node: '>0.10.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var client = null;

      // TODO: check exception and fix test
      process.once('uncaughtException', function() {
        client.close();
        done();
      });

      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      MongoClient.connect(
        configuration.url(),
        {
          server: { sslValidate: false },
          replset: { sslValidate: false },
          mongos: { sslValidate: false }
        },
        function(err, _client) {
          test.equal(null, err);
          client = _client;
          var db = client.db(configuration.db);

          db.collection('throwerrorduringoperation').insert([{ a: 1 }, { a: 1 }], function(err) {
            test.equal(null, err);

            db
              .collection('throwerrorduringoperation')
              .find()
              .toArray(function() {
                err = a; // eslint-disable-line
              });
          });
        }
      );
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleThrownError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db.createCollection('shouldCorrectlyHandleThrownError', function(err) {
          test.equal(null, err);

          try {
            db.collection('shouldCorrectlyHandleThrownError', function() {
              debug(someUndefinedVariable); // eslint-disable-line
            });
          } catch (err) {
            test.ok(err != null);
            client.close();
            done();
          }
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleThrownErrorInRename', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        node: '>0.10.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, socketTimeoutMS: 5000, connectTimeoutMS: 5000 }
      );
      var domain = require('domain');
      var d = domain.create();
      d.on('error', function(err) {
        test.ok(err !== null);
        client.close();
        d.dispose();
        done();
      });

      d.run(function() {
        client.connect(function(err, client) {
          var db = client.db(configuration.db);

          // Execute code
          db.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err) {
            test.equal(null, err);
            db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
              collection.rename('shouldCorrectlyHandleThrownErrorInRename2', function() {
                debug(someUndefinedVariable); // eslint-disable-line
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
  it('shouldCorrectlyHandleExceptionsInCursorNext', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });

      process.once('uncaughtException', function(err) {
        test.ok(err != null);
        client.close();
        done();
      });

      client.connect(function(err, db) {
        var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');
        col.insert({ a: 1 }, function(err) {
          test.equal(null, err);
          col.find().next(function() {
            boom; // eslint-disable-line
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleExceptionsInCursorEach', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });

      process.once('uncaughtException', function(err) {
        test.ok(err != null);
        client.close();
        done();
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');

        col.insert({ a: 1 }, function(err) {
          test.equal(null, err);
          col.find().each(function() {
            boom; // eslint-disable-line
          });
        });
      });
    }
  });
});
