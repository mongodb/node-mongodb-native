'use strict';
var format = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

var restartAndDone = function(configuration, done) {
  configuration.manager.restart().then(function() {
    done();
  });
};

describe('ReplSet (Operations)', function() {
  before(function() {
    var configuration = this.configuration;
    return setupDatabase(configuration).then(function() {
      return configuration.manager.restart();
    });
  });

  /*******************************************************************
   *
   * Ordered
   *
   *******************************************************************/

  /**
   * @ignore
   */
  it('Should fail due to w:5 and wtimeout:1 with ordered batch api', {
    metadata: {
      requires: {
        topology: 'replicaset',
        mongodb: '>=2.6.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient;

      // Create url
      var url = format(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        format('%s:%s', configuration.host, configuration.port),
        format('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      // legacy tests
      var executeTests = function(_db, _callback) {
        // Get the collection
        var col = _db.collection('batch_write_ordered_ops_0');

        // Cleanup
        col.remove({}, function(err) {
          test.equal(null, err);

          // ensure index
          col.ensureIndex({ a: 1 }, { unique: true }, function(err) {
            test.equal(null, err);

            // Initialize the Ordered Batch
            var batch = col.initializeOrderedBulkOp();
            batch.insert({ a: 1 });
            batch.insert({ a: 2 });

            // Execute the operations
            batch.execute({ w: 5, wtimeout: 1 }, function(err, result) {
              test.equal(2, result.nInserted);
              test.equal(0, result.nMatched);
              test.equal(0, result.nUpserted);
              test.equal(0, result.nRemoved);
              test.ok(result.nModified == null || result.nModified === 0);

              var writeConcernError = result.getWriteConcernError();
              test.ok(writeConcernError != null);
              test.ok(writeConcernError.code != null);
              test.ok(writeConcernError.errmsg != null);

              test.equal(0, result.getWriteErrorCount());

              // Callback
              _callback();
            });
          });
        });
      };

      MongoClient.connect(url, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        executeTests(db, function() {
          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should fail due to w:5 and wtimeout:1 combined with duplicate key errors with ordered batch api',
    {
      metadata: {
        requires: {
          topology: 'replicaset',
          mongodb: '>=2.6.0'
        }
      },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          MongoClient = mongo.MongoClient;

        // Create url
        var url = format(
          'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
          format('%s:%s', configuration.host, configuration.port),
          format('%s:%s', configuration.host, configuration.port + 1),
          'integration_test_',
          configuration.replicasetName,
          'primary'
        );

        // legacy tests
        var executeTests = function(_db, _callback) {
          // Get the collection
          var col = _db.collection('batch_write_ordered_ops_1');

          // Cleanup
          col.remove({}, function(err) {
            test.equal(null, err);

            // ensure index
            col.ensureIndex({ a: 1 }, { unique: true }, function(err) {
              test.equal(null, err);

              // Initialize the Ordered Batch
              var batch = col.initializeOrderedBulkOp();
              batch.insert({ a: 1 });
              batch
                .find({ a: 3 })
                .upsert()
                .updateOne({ a: 3, b: 1 });
              batch.insert({ a: 1 });
              batch.insert({ a: 2 });

              // Execute the operations
              batch.execute({ w: 5, wtimeout: 1 }, function(err, result) {
                test.equal(1, result.nInserted);
                test.equal(0, result.nMatched);
                test.equal(1, result.nUpserted);
                test.equal(0, result.nRemoved);
                test.ok(result.nModified == null || result.nModified === 0);

                var writeConcernError = result.getWriteConcernError();
                test.ok(writeConcernError != null);
                test.ok(writeConcernError.code != null);
                test.ok(writeConcernError.errmsg != null);

                test.equal(1, result.getWriteErrorCount());

                // Individual error checking
                var error = result.getWriteErrorAt(0);
                test.equal(2, error.index);
                test.equal(11000, error.code);
                test.ok(error.errmsg != null);
                test.equal(1, error.getOperation().a);

                // Callback
                _callback();
              });
            });
          });
        };

        MongoClient.connect(url, function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          executeTests(db, function() {
            // Finish up test
            client.close();
            done();
          });
        });
      }
    }
  );

  /*******************************************************************
   *
   * Unordered
   *
   *******************************************************************/

  /**
   * @ignore
   */
  it('Should fail due to w:5 and wtimeout:1 with unordered batch api', {
    metadata: {
      requires: {
        topology: 'replicaset',
        mongodb: '>=2.6.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient;

      // Create url
      var url = format(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        format('%s:%s', configuration.host, configuration.port),
        format('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      // legacy tests
      var executeTests = function(_db, _callback) {
        // Get the collection
        var col = _db.collection('batch_write_unordered_ops_0');

        // Cleanup
        col.remove({}, function(err) {
          test.equal(null, err);

          // ensure index
          col.ensureIndex({ a: 1 }, { unique: true }, function(err) {
            test.equal(null, err);

            // Initialize the Ordered Batch
            var batch = col.initializeUnorderedBulkOp();
            batch.insert({ a: 1 });
            batch
              .find({ a: 3 })
              .upsert()
              .updateOne({ a: 3, b: 1 });
            batch.insert({ a: 2 });

            // Execute the operations
            batch.execute({ w: 5, wtimeout: 1 }, function(err, result) {
              test.equal(2, result.nInserted);
              test.equal(0, result.nMatched);
              test.equal(1, result.nUpserted);
              test.equal(0, result.nRemoved);
              test.ok(result.nModified == null || result.nModified === 0);

              var writeConcernError = result.getWriteConcernError();
              test.ok(writeConcernError != null);
              test.ok(writeConcernError.code != null);
              test.ok(writeConcernError.errmsg != null);

              test.equal(0, result.getWriteErrorCount());

              // Callback
              _callback();
            });
          });
        });
      };

      MongoClient.connect(url, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        executeTests(db, function() {
          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should fail due to w:5 and wtimeout:1 combined with duplicate key errors with unordered batch api',
    {
      metadata: {
        requires: {
          topology: 'replicaset',
          mongodb: '>=2.6.0'
        }
      },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          MongoClient = mongo.MongoClient;

        // Create url
        var url = format(
          'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
          format('%s:%s', configuration.host, configuration.port),
          format('%s:%s', configuration.host, configuration.port + 1),
          'integration_test_',
          configuration.replicasetName,
          'primary'
        );

        // legacy tests
        var executeTests = function(_db, _callback) {
          // Get the collection
          var col = _db.collection('batch_write_unordered_ops_1');

          // Cleanup
          col.remove({}, function(err) {
            test.equal(null, err);

            // ensure index
            col.ensureIndex({ a: 1 }, { unique: true }, function(err) {
              test.equal(null, err);

              // Initialize the Ordered Batch
              var batch = col.initializeOrderedBulkOp();
              batch.insert({ a: 1 });
              batch
                .find({ a: 3 })
                .upsert()
                .updateOne({ a: 3, b: 1 });
              batch.insert({ a: 1 });
              batch.insert({ a: 2 });

              // Execute the operations
              batch.execute({ w: 5, wtimeout: 1 }, function(err, result) {
                test.equal(1, result.nInserted);
                test.equal(0, result.nMatched);
                test.equal(1, result.nUpserted);
                test.equal(0, result.nRemoved);
                test.ok(result.nModified == null || result.nModified === 0);

                var writeConcernError = result.getWriteConcernError();
                test.ok(writeConcernError != null);
                test.ok(writeConcernError.code != null);
                test.ok(writeConcernError.errmsg != null);

                // Might or might not have a write error depending on
                // Unordered execution order
                test.ok(result.getWriteErrorCount() === 0 || result.getWriteErrorCount() === 1);

                // If we have an error it should be a duplicate key error
                if (result.getWriteErrorCount() === 1) {
                  var error = result.getWriteErrorAt(0);
                  test.ok(error.index === 0 || error.index === 2);
                  test.equal(11000, error.code);
                  test.ok(error.errmsg != null);
                  test.equal(1, error.getOperation().a);
                }

                // Callback
                _callback();
              });
            });
          });
        };

        MongoClient.connect(url, function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          executeTests(db, function() {
            // Finish up test
            client.close();
            done();
          });
        });
      }
    }
  );

  it('Should fail to do map reduce to out collection', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>1.7.6' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient,
        ReadPreference = mongo.ReadPreference;

      // Create url
      var url = format(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        format('%s:%s', configuration.host, configuration.port),
        format('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      MongoClient.connect(url, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        var collection = db.collection('test_map_reduce_functions_notInline_map_reduce', {
          readPreference: ReadPreference.SECONDARY,
          w: 2,
          wtimeout: 10000
        });

        // Parse version of server if available
        db.admin().serverInfo(function(err) {
          test.equal(null, err);

          // Map function
          var map = function() {
            emit(this.user_id, 1); // eslint-disable-line
          };
          // Reduce function
          var reduce = function(k, vals) {  // eslint-disable-line
            // eslint-disable-line
            return 1;
          };

          // Execute map reduce and return results inline
          collection.mapReduce(
            map,
            reduce,
            { out: { replace: 'replacethiscollection' }, readPreference: ReadPreference.SECONDARY },
            function(err) {
              test.equal(null, err);
              client.close();
              done();
            }
          );
        });
      });
    }
  });

  it('Should correctly execute ensureIndex with readPreference primaryPreferred', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>1.7.6' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient;

      MongoClient.connect(
        'mongodb://localhost:31001/integration_test_?replicaSet=rs&readPreference=primaryPreferred'
      ).then(function(client) {
        var db = client.db(configuration.db);
        var collection = db.collection('ensureIndexWithPrimaryPreferred');
        collection.ensureIndex({ a: 1 }, function(err) {
          test.equal(null, err);

          client.close();
          done();
        });
      });
    }
  });

  it('Should Correctly group using replicaset', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient,
        ReadPreference = mongo.ReadPreference;

      // Create url
      var url = format(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        format('%s:%s', configuration.host, configuration.port),
        format('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      var manager = configuration.manager;

      MongoClient.connect(url, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        var collection = db.collection('testgroup_replicaset', {
          readPreference: ReadPreference.SECONDARY,
          w: 2,
          wtimeout: 10000
        });

        collection.insert(
          [{ key: 1, x: 10 }, { key: 2, x: 30 }, { key: 1, x: 20 }, { key: 3, x: 20 }],
          configuration.writeConcernMax(),
          function(err) {
            test.equal(null, err);

            // Kill the primary
            manager.primary().then(function(m) {
              // Stop the primary
              m.stop().then(function() {
                // Do a collection find
                collection.group(
                  ['key'],
                  {},
                  { sum: 0 },
                  function reduce(record, memo) {
                    memo.sum += record.x;
                  },
                  true,
                  function(err, items) {
                    test.equal(null, err);
                    test.equal(3, items.length);
                    client.close();
                    restartAndDone(configuration, done);
                  }
                );
              });
            });
          }
        );
      });
    }
  });

  it('Should Correctly execute createIndex with secondary readPreference', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient,
        ReadPreference = mongo.ReadPreference;

      // Create url
      var url = format(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        format('%s:%s', configuration.host, configuration.port),
        format('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'secondary'
      );

      MongoClient.connect(url, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        var collection = db.collection('testgroup_replicaset_2', {
          readPreference: ReadPreference.SECONDARY,
          w: 2,
          wtimeout: 10000
        });

        collection.createIndexes([{ name: 'a_1', key: { a: 1 } }], function(err) {
          test.equal(null, err);

          client.close();
          restartAndDone(configuration, done);
        });
      });
    }
  });
});
