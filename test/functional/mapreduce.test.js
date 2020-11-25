'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { Code } = require('../../src');
const { expect } = require('chai');

describe('MapReduce', function () {
  before(function () {
    return setupDatabase(this.configuration, ['outputCollectionDb']);
  });

  /**
   * Mapreduce tests
   */
  it('shouldPerformMapReduceWithStringFunctions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // String functions
              var map = 'function() { emit(this.user_id, 1); }';
              var reduce = 'function(k,vals) { return 1; }';

              collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } }, function (
                err,
                collection
              ) {
                collection.findOne({ _id: 1 }, function (err, result) {
                  test.equal(1, result.value);

                  collection.findOne({ _id: 2 }, function (err, result) {
                    test.equal(1, result.value);
                    client.close(done);
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  /**
   * Mapreduce tests
   */
  it('shouldForceMapReduceError', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>1.7.6',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        db.createCollection('should_force_map_reduce_error', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              // String functions
              var map = 'function() { emiddft(this.user_id, 1); }';
              var reduce = 'function(k,vals) { return 1; }';

              collection.mapReduce(map, reduce, { out: { inline: 1 } }, function (err) {
                test.ok(err != null);
                client.close(done);
              });
            }
          );
        });
      });
    }
  });

  it('shouldPerformMapReduceWithParametersBeingFunctions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce_with_functions_as_arguments', function (
          err,
          collection
        ) {
          expect(err).to.not.exist;
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // String functions
              var map = function () {
                emit(this.user_id, 1); // eslint-disable-line
              };
              var reduce = function () {
                return 1;
              };

              collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } }, function (
                err,
                collection
              ) {
                collection.findOne({ _id: 1 }, function (err, result) {
                  test.equal(1, result.value);

                  collection.findOne({ _id: 2 }, function (err, result) {
                    test.equal(1, result.value);
                    client.close(done);
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  it('shouldPerformMapReduceWithCodeObjects', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce_with_code_objects', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              // String functions
              var map = new Code('function() { emit(this.user_id, 1); }');
              var reduce = new Code('function(k,vals) { return 1; }');

              collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } }, function (
                err,
                collection
              ) {
                collection.findOne({ _id: 1 }, function (err, result) {
                  test.equal(1, result.value);

                  collection.findOne({ _id: 2 }, function (err, result) {
                    test.equal(1, result.value);
                    client.close(done);
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  it('shouldPerformMapReduceWithOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce_with_options', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              // String functions
              var map = new Code('function() { emit(this.user_id, 1); }');
              var reduce = new Code('function(k,vals) { return 1; }');

              collection.mapReduce(
                map,
                reduce,
                { out: { replace: 'tempCollection' }, query: { user_id: { $gt: 1 } } },
                function (err, collection) {
                  collection.count(function (err, count) {
                    test.equal(2, count);

                    collection.findOne({ _id: 2 }, function (err, result) {
                      test.equal(1, result.value);

                      collection.findOne({ _id: 3 }, function (err, result) {
                        test.equal(1, result.value);
                        client.close(done);
                      });
                    });
                  });
                }
              );
            }
          );
        });
      });
    }
  });

  it('shouldHandleMapReduceErrors', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce_error', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              // String functions
              var map = new Code("function() { throw 'error'; }");
              var reduce = new Code("function(k,vals) { throw 'error'; }");

              collection.mapReduce(
                map,
                reduce,
                { out: { inline: 1 }, query: { user_id: { $gt: 1 } } },
                function (err) {
                  test.ok(err != null);
                  client.close(done);
                }
              );
            }
          );
        });
      });
    }
  });

  it('shouldSaveDataToDifferentDbFromMapreduce', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>= 3.4'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        const outDb = client.db('outputCollectionDb');

        // Create a test collection
        db.createCollection('test_map_reduce_functions', function (err, collection) {
          // create the output collection
          outDb.createCollection('tempCollection', err => {
            expect(err).to.not.exist;

            // Insert some documents to perform map reduce over
            collection.insert(
              [{ user_id: 1 }, { user_id: 2 }],
              configuration.writeConcernMax(),
              function (err) {
                expect(err).to.not.exist;
                // Map function
                var map = function () {
                  emit(this.user_id, 1); // eslint-disable-line
                };
                // Reduce function
                var reduce = function () {
                  return 1;
                };

                // Perform the map reduce
                collection.mapReduce(
                  map,
                  reduce,
                  { out: { replace: 'test_map_reduce_functions_temp', db: 'outputCollectionDb' } },
                  function (err, collection) {
                    expect(err).to.not.exist;

                    // Mapreduce returns the temporary collection with the results
                    collection.findOne({ _id: 1 }, function (err, result) {
                      expect(err).to.not.exist;
                      test.equal(1, result.value);

                      collection.findOne({ _id: 2 }, function (err, result) {
                        expect(err).to.not.exist;
                        test.equal(1, result.value);

                        client.close(done);
                      });
                    });
                  }
                );
              }
            );
          });
        });
      });
    }
  });

  /**
   * Mapreduce tests
   */
  it.skip('shouldPerformMapReduceWithScopeContainingFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var util = {
        times_one_hundred: function (x) {
          return x * 100;
        }
      };

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_map_reduce', function (err, collection) {
          collection.insert(
            [{ user_id: 1 }, { user_id: 2 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              // String functions
              var map = 'function() { emit(this.user_id, util.times_one_hundred(this.user_id)); }';
              var reduce = 'function(k,vals) { return vals[0]; }';

              // Before MapReduce
              test.equal(200, util.times_one_hundred(2));

              collection.mapReduce(
                map,
                reduce,
                { scope: { util: util }, out: { replace: 'test_map_reduce_temp' } },
                function (err, collection) {
                  // After MapReduce
                  test.equal(200, util.times_one_hundred(2));

                  collection.findOne({ _id: 2 }, function (err, result) {
                    // During MapReduce
                    test.equal(200, result.value);

                    client.close(done);
                  });
                }
              );
            }
          );
        });
      });
    }
  });
});
