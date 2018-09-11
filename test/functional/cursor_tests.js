'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const fs = require('fs');
const expect = require('chai').expect;
const Long = require('bson').Long;
const sinon = require('sinon');
const ReadPreference = require('mongodb-core').ReadPreference;
const Buffer = require('safe-buffer').Buffer;

describe('Cursor', function() {
  before(function() {
    return setupDatabase(this.configuration, [
      'cursorkilltest1',
      'cursor_session_tests',
      'cursor_session_tests2'
    ]);
  });

  /**
   * @ignore
   * @api private
   */
  it('cursorShouldBeAbleToResetOnToArrayRunningQueryAgain', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_to_a', function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var cursor = collection.find({});
            cursor.toArray(function(err) {
              test.equal(null, err);

              // Should fail if called again (cursor should be closed)
              cursor.toArray(function(err) {
                test.equal(null, err);

                // Should fail if called again (cursor should be closed)
                cursor.each(function(err, item) {
                  test.equal(null, err);

                  // Let's close the db
                  if (!item) {
                    client.close();
                    done();
                  }
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('cursor should close after first next operation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('close_on_next', function(err, collection) {
          test.equal(null, err);

          collection.insert(
            [{ a: 1 }, { a: 1 }, { a: 1 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              var cursor = collection.find({});
              cursor.batchSize(2);
              cursor.next(function(err) {
                test.equal(null, err);

                cursor.close();
                client.close();
                done();
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('cursor should trigger getMore', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('trigger_get_more', function(err, collection) {
          test.equal(null, err);

          collection.insert(
            [{ a: 1 }, { a: 1 }, { a: 1 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              var cursor = collection.find({});
              cursor.batchSize(2);
              cursor.toArray(function(err) {
                test.equal(null, err);

                client.close();
                done();
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyExecuteCursorExplain', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_explain', function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.find({ a: 1 }).explain(function(err, explaination) {
              test.equal(null, err);
              test.ok(explaination != null);

              // Let's close the db
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
   * @api private
   */
  it('shouldCorrectlyExecuteCursorCount', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_count', function(err, collection) {
          test.equal(null, err);

          collection.find().count(function(err) {
            test.equal(null, err);

            function insert(callback) {
              var total = 10;

              for (var i = 0; i < 10; i++) {
                collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                  test.equal(null, e);
                  total = total - 1;
                  if (total === 0) callback();
                });
              }
            }

            function finished() {
              collection.find().count(function(err, count) {
                test.equal(null, err);
                test.equal(10, count);
                test.ok(count.constructor === Number);

                collection.find({}, { limit: 5 }).count(function(err, count) {
                  test.equal(null, err);
                  test.equal(5, count);

                  collection.find({}, { skip: 5 }).count(function(err, count) {
                    test.equal(null, err);
                    test.equal(5, count);

                    db.collection('acollectionthatdoesn').count(function(err, count) {
                      test.equal(null, err);
                      test.equal(0, count);

                      var cursor = collection.find();
                      cursor.count(function(err, count) {
                        test.equal(null, err);
                        test.equal(10, count);

                        cursor.each(function(err, item) {
                          test.equal(null, err);
                          if (item == null) {
                            cursor.count(function(err, count2) {
                              test.equal(null, err);
                              test.equal(10, count2);
                              test.equal(count, count2);
                              // Let's close the db
                              client.close();
                              done();
                            });
                          }
                        });
                      });
                    });
                  });
                });
              });
            }

            insert(function() {
              finished();
            });
          });
        });
      });
    }
  });

  it('Should correctly execute cursor count with secondary readPreference', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: 'replicaset' }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      client.connect((err, client) => {
        const db = client.db(configuration.db);

        let internalClientCursor;
        if (configuration.usingUnifiedTopology()) {
          internalClientCursor = sinon.spy(client.topology, 'cursor');
        } else {
          internalClientCursor = sinon.spy(client.topology.s.coreTopology, 'cursor');
        }

        const expectedReadPreference = new ReadPreference(ReadPreference.SECONDARY);
        const cursor = db.collection('countTEST').find({ qty: { $gt: 4 } });
        cursor.count(true, { readPreference: ReadPreference.SECONDARY }, err => {
          expect(err).to.be.null;
          expect(internalClientCursor.getCall(0).args[2])
            .to.have.nested.property('readPreference')
            .that.deep.equals(expectedReadPreference);
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyExecuteCursorCountWithDottedCollectionName', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_count.ext', function(err, collection) {
          test.equal(null, err);

          collection.find().count(function(err) {
            test.equal(null, err);

            function insert(callback) {
              var total = 10;

              for (var i = 0; i < 10; i++) {
                collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                  test.equal(null, e);
                  total = total - 1;
                  if (total === 0) callback();
                });
              }
            }

            function finished() {
              collection.find().count(function(err, count) {
                test.equal(null, err);
                test.equal(10, count);
                test.ok(count.constructor === Number);

                collection.find({}, { limit: 5 }).count(function(err, count) {
                  test.equal(null, err);
                  test.equal(5, count);

                  collection.find({}, { skip: 5 }).count(function(err, count) {
                    test.equal(null, err);
                    test.equal(5, count);

                    db.collection('acollectionthatdoesn').count(function(err, count) {
                      test.equal(null, err);
                      test.equal(0, count);

                      var cursor = collection.find();
                      cursor.count(function(err, count) {
                        test.equal(null, err);
                        test.equal(10, count);

                        cursor.each(function(err, item) {
                          test.equal(null, err);
                          if (item == null) {
                            cursor.count(function(err, count2) {
                              test.equal(null, err);
                              test.equal(10, count2);
                              test.equal(count, count2);
                              // Let's close the db
                              client.close();
                              done();
                            });
                          }
                        });
                      });
                    });
                  });
                });
              });
            }

            insert(function() {
              finished();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyExecuteSortOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_sort', function(err, collection) {
          test.equal(null, err);
          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function f() {
            var number_of_functions = 9;
            var finished = function() {
              number_of_functions = number_of_functions - 1;
              if (number_of_functions === 0) {
                client.close();
                done();
              }
            };

            var cursor = collection.find().sort(['a', 1]);
            test.deepEqual(['a', 1], cursor.sortValue);
            finished();

            cursor = collection.find().sort('a', 1);
            test.deepEqual([['a', 1]], cursor.sortValue);
            finished();

            cursor = collection.find().sort('a', -1);
            test.deepEqual([['a', -1]], cursor.sortValue);
            finished();

            cursor = collection.find().sort('a', 'asc');
            test.deepEqual([['a', 'asc']], cursor.sortValue);
            finished();

            cursor = collection.find().sort([['a', -1], ['b', 1]]);
            var entries = cursor.sortValue.entries();
            test.deepEqual(['a', -1], entries.next().value);
            test.deepEqual(['b', 1], entries.next().value);
            finished();

            cursor = collection
              .find()
              .sort('a', 1)
              .sort('a', -1);
            test.deepEqual([['a', -1]], cursor.sortValue);
            finished();

            cursor.next(function(err) {
              test.equal(null, err);
              try {
                cursor.sort(['a']);
              } catch (err) {
                test.equal('Cursor is closed', err.message);
                finished();
              }
            });

            collection
              .find()
              .sort('a', 25)
              .next(function(err) {
                test.equal(
                  "Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]",
                  err.message
                );
                finished();
              });

            collection
              .find()
              .sort(25)
              .next(function(err) {
                test.equal(
                  "Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]",
                  err.message
                );
                finished();
              });
          }

          insert(function() {
            f();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldThrowErrorOnEachWhenMissingCallback', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_each', function(err, collection) {
          test.equal(null, err);
          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection.find(function(err, cursor) {
              test.equal(null, err);
              test.throws(function() {
                cursor.each();
              });

              client.close();
              done();
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyHandleLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_cursor_limit', function(err, collection) {
          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection
              .find()
              .limit(5)
              .toArray(function(err, items) {
                test.equal(5, items.length);

                // Let's close the db
                test.equal(null, err);
                client.close();
                done();
              });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyHandleNegativeOneLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_cursor_negative_one_limit', function(err, collection) {
          test.equal(null, err);
          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection
              .find()
              .limit(-1)
              .toArray(function(err, items) {
                test.equal(null, err);
                test.equal(1, items.length);

                // Let's close the db
                client.close();
                done();
              });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyHandleAnyNegativeLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_cursor_any_negative_limit', function(err, collection) {
          test.equal(null, err);
          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection
              .find()
              .limit(-5)
              .toArray(function(err, items) {
                test.equal(null, err);
                test.equal(5, items.length);

                // Let's close the db
                client.close();
                done();
              });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyReturnErrorsOnIllegalLimitValues', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_limit_exceptions', function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
          });

          collection.find(function(err, cursor) {
            test.equal(null, err);

            try {
              cursor.limit('not-an-integer');
            } catch (err) {
              test.equal('limit requires an integer', err.message);
            }

            try {
              cursor.limit('not-an-integer');
              test.ok(false);
            } catch (err) {
              test.equal('limit requires an integer', err.message);
            }
          });

          collection.find(function(err, cursor) {
            test.equal(null, err);

            cursor.close(function(err, cursor) {
              test.equal(null, err);

              try {
                cursor.limit(1);
              } catch (err) {
                test.equal('Cursor is closed', err.message);
              }

              collection.find(function(err, cursor) {
                test.equal(null, err);

                cursor.next(function(err) {
                  test.equal(null, err);
                  try {
                    cursor.limit(1);
                  } catch (err) {
                    test.equal('Cursor is closed', err.message);
                  }

                  try {
                    cursor.limit(1);
                    test.ok(false);
                  } catch (err) {
                    test.equal('Cursor is closed', err.message);
                  }

                  client.close();
                  done();
                });
              });

              try {
                cursor.limit(1);
                test.ok(false);
              } catch (err) {
                test.equal('Cursor is closed', err.message);
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlySkipRecordsOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_skip', function(err, collection) {
          test.equal(null, err);

          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);

                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection.find(function(err, cursor) {
              test.equal(null, err);
              cursor.count(function(err, count) {
                test.equal(null, err);
                test.equal(10, count);
              });
            });

            collection.find(function(err, cursor) {
              test.equal(null, err);
              cursor.toArray(function(err, items) {
                test.equal(null, err);
                test.equal(10, items.length);

                collection
                  .find()
                  .skip(2)
                  .toArray(function(err, items2) {
                    test.equal(null, err);
                    test.equal(8, items2.length);

                    // Check that we have the same elements
                    var numberEqual = 0;
                    var sliced = items.slice(2, 10);

                    for (var i = 0; i < sliced.length; i++) {
                      if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
                    }

                    test.equal(8, numberEqual);

                    // Let's close the db
                    client.close();
                    done();
                  });
              });
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyReturnErrorsOnIllegalSkipValues', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_skip_exceptions', function(err, collection) {
          test.equal(null, err);
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
          });

          try {
            collection.find().skip('not-an-integer');
          } catch (err) {
            test.equal('skip requires an integer', err.message);
          }

          var cursor = collection.find();
          cursor.next(function(err) {
            test.equal(null, err);

            try {
              cursor.skip(1);
            } catch (err) {
              test.equal('Cursor is closed', err.message);
            }

            var cursor2 = collection.find();
            cursor2.close(function(err) {
              test.equal(null, err);
              try {
                cursor2.skip(1);
              } catch (err) {
                test.equal('Cursor is closed', err.message);
              }

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
   * @api private
   */
  it('shouldReturnErrorsOnIllegalBatchSizes', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_batchSize_exceptions', function(err, collection) {
          test.equal(null, err);
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
          });
          var cursor = collection.find();

          try {
            cursor.batchSize('not-an-integer');
            test.ok(false);
          } catch (err) {
            test.equal('batchSize requires an integer', err.message);
          }

          cursor = collection.find();
          cursor.next(function(err) {
            test.equal(null, err);

            cursor.next(function(err) {
              test.equal(null, err);

              try {
                cursor.batchSize(1);
                test.ok(false);
              } catch (err) {
                test.equal('Cursor is closed', err.message);
              }

              var cursor2 = collection.find();
              cursor2.close(function(err) {
                test.equal(null, err);
                try {
                  cursor2.batchSize(1);
                  test.ok(false);
                } catch (err) {
                  test.equal('Cursor is closed', err.message);
                }

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
   * @api private
   */
  it('shouldCorrectlyHandleChangesInBatchSizes', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_not_multiple_batch_size', function(err, collection) {
          test.equal(null, err);

          var records = 6;
          var batchSize = 2;
          var docs = [];
          for (var i = 0; i < records; i++) {
            docs.push({ a: i });
          }

          collection.insert(docs, configuration.writeConcernMax(), function() {
            test.equal(null, err);

            collection.find({}, { batchSize: batchSize }, function(err, cursor) {
              test.equal(null, err);

              //1st
              cursor.next(function(err, items) {
                test.equal(null, err);
                //cursor.items should contain 1 since nextObject already popped one
                test.equal(1, cursor.bufferedCount());
                test.ok(items != null);

                //2nd
                cursor.next(function(err, items) {
                  test.equal(null, err);
                  test.equal(0, cursor.bufferedCount());
                  test.ok(items != null);

                  //test batch size modification on the fly
                  batchSize = 3;
                  cursor.batchSize(batchSize);

                  //3rd
                  cursor.next(function(err, items) {
                    test.equal(null, err);
                    test.equal(2, cursor.bufferedCount());
                    test.ok(items != null);

                    //4th
                    cursor.next(function(err, items) {
                      test.equal(null, err);
                      test.equal(1, cursor.bufferedCount());
                      test.ok(items != null);

                      //5th
                      cursor.next(function(err, items) {
                        test.equal(null, err);
                        test.equal(0, cursor.bufferedCount());
                        test.ok(items != null);

                        //6th
                        cursor.next(function(err, items) {
                          test.equal(null, err);
                          test.equal(0, cursor.bufferedCount());
                          test.ok(items != null);

                          //No more
                          cursor.next(function(err, items) {
                            test.equal(null, err);
                            test.ok(items == null);
                            test.ok(cursor.isClosed());

                            client.close();
                            done();
                          });
                        });
                      });
                    });
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
   * @ignore
   * @api private
   */
  it('shouldCorrectlyHandleBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_multiple_batch_size', function(err, collection) {
          test.equal(null, err);

          //test with the last batch that is a multiple of batchSize
          var records = 4;
          var batchSize = 2;
          var docs = [];
          for (var i = 0; i < records; i++) {
            docs.push({ a: i });
          }

          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.find({}, { batchSize: batchSize }, function(err, cursor) {
              test.equal(null, err);

              //1st
              cursor.next(function(err, items) {
                test.equal(null, err);
                test.equal(1, cursor.bufferedCount());
                test.ok(items != null);

                //2nd
                cursor.next(function(err, items) {
                  test.equal(null, err);
                  test.equal(0, cursor.bufferedCount());
                  test.ok(items != null);

                  //3rd
                  cursor.next(function(err, items) {
                    test.equal(null, err);
                    test.equal(1, cursor.bufferedCount());
                    test.ok(items != null);

                    //4th
                    cursor.next(function(err, items) {
                      test.equal(null, err);
                      test.equal(0, cursor.bufferedCount());
                      test.ok(items != null);

                      //No more
                      cursor.next(function(err, items) {
                        test.equal(null, err);
                        test.ok(items == null);
                        test.ok(cursor.isClosed());

                        client.close();
                        done();
                      });
                    });
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
   * @ignore
   * @api private
   */
  it('shouldHandleWhenLimitBiggerThanBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_limit_greater_than_batch_size', function(err, collection) {
          test.equal(null, err);

          var limit = 4;
          var records = 10;
          var batchSize = 3;
          var docs = [];
          for (var i = 0; i < records; i++) {
            docs.push({ a: i });
          }

          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var cursor = collection.find({}, { batchSize: batchSize, limit: limit });
            //1st
            cursor.next(function(err) {
              test.equal(null, err);
              test.equal(2, cursor.bufferedCount());

              //2nd
              cursor.next(function(err) {
                test.equal(null, err);
                test.equal(1, cursor.bufferedCount());

                //3rd
                cursor.next(function(err) {
                  test.equal(null, err);
                  test.equal(0, cursor.bufferedCount());

                  //4th
                  cursor.next(function(err) {
                    test.equal(null, err);

                    //No more
                    cursor.next(function(err, items) {
                      test.equal(null, err);
                      test.ok(items == null);
                      test.ok(cursor.isClosed());

                      client.close();
                      done();
                    });
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
   * @ignore
   * @api private
   */
  it('shouldHandleLimitLessThanBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_limit_less_than_batch_size', function(err, collection) {
          test.equal(null, err);

          var limit = 2;
          var records = 10;
          var batchSize = 4;
          var docs = [];
          for (var i = 0; i < records; i++) {
            docs.push({ a: i });
          }

          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var cursor = collection.find({}, { batchSize: batchSize, limit: limit });
            //1st
            cursor.next(function(err) {
              test.equal(null, err);
              test.equal(1, cursor.bufferedCount());

              //2nd
              cursor.next(function(err) {
                test.equal(null, err);
                test.equal(0, cursor.bufferedCount());

                //No more
                cursor.next(function(err, items) {
                  test.equal(null, err);
                  test.ok(items == null);
                  test.ok(cursor.isClosed());

                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldHandleSkipLimitChaining', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var collection = db.collection('shouldHandleSkipLimitChaining');

        function insert(callback) {
          var total = 10;

          for (var i = 0; i < 10; i++) {
            collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
              test.equal(null, e);
              total = total - 1;
              if (total === 0) callback();
            });
          }
        }

        function finished() {
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(10, items.length);

            collection
              .find()
              .limit(5)
              .skip(3)
              .toArray(function(err, items2) {
                test.equal(null, err);
                test.equal(5, items2.length);

                // Check that we have the same elements
                var numberEqual = 0;
                var sliced = items.slice(3, 8);

                for (var i = 0; i < sliced.length; i++) {
                  if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
                }
                test.equal(5, numberEqual);

                // Let's close the db
                client.close();
                done();
              });
          });
        }

        insert(function() {
          finished();
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyHandleLimitSkipChainingInline', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_limit_skip_chaining_inline', function(err, collection) {
          test.equal(null, err);

          function insert(callback) {
            var total = 10;

            for (var i = 0; i < 10; i++) {
              collection.insert({ x: i }, configuration.writeConcernMax(), function(e) {
                test.equal(null, e);
                total = total - 1;
                if (total === 0) callback();
              });
            }
          }

          function finished() {
            collection.find().toArray(function(err, items) {
              test.equal(null, err);
              test.equal(10, items.length);

              collection
                .find()
                .limit(5)
                .skip(3)
                .toArray(function(err, items2) {
                  test.equal(null, err);
                  test.equal(5, items2.length);

                  // Check that we have the same elements
                  var numberEqual = 0;
                  var sliced = items.slice(3, 8);

                  for (var i = 0; i < sliced.length; i++) {
                    if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
                  }
                  test.equal(5, numberEqual);

                  // Let's close the db
                  client.close();
                  done();
                });
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCloseCursorNoQuerySent', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_close_no_query_sent', function(err, collection) {
          test.equal(null, err);

          collection.find().close(function(err, cursor) {
            test.equal(null, err);
            test.equal(true, cursor.isClosed());
            // Let's close the db
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyRefillViaGetMoreCommand', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var COUNT = 1000;

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_refill_via_get_more', function(err, collection) {
          test.equal(null, err);

          function insert(callback) {
            var docs = [];

            for (var i = 0; i < COUNT; i++) {
              docs.push({ a: i });
            }

            collection.insertMany(docs, configuration.writeConcernMax(), callback);
          }

          function finished() {
            collection.count(function(err, count) {
              test.equal(null, err);
              test.equal(COUNT, count);
            });

            var total = 0;
            collection.find({}, {}).each(function(err, item) {
              test.equal(null, err);
              if (item != null) {
                total = total + item.a;
              } else {
                test.equal(499500, total);

                collection.count(function(err, count) {
                  test.equal(null, err);
                  test.equal(COUNT, count);
                });

                collection.count(function(err, count) {
                  test.equal(null, err);
                  test.equal(COUNT, count);

                  var total2 = 0;
                  collection.find().each(function(err, item) {
                    test.equal(null, err);
                    if (item != null) {
                      total2 = total2 + item.a;
                    } else {
                      test.equal(499500, total2);
                      collection.count(function(err, count) {
                        test.equal(null, err);
                        test.equal(COUNT, count);
                        test.equal(total, total2);

                        // Let's close the db
                        client.close();
                        done();
                      });
                    }
                  });
                });
              }
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyRefillViaGetMoreAlternativeCollection', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_refill_via_get_more_alt_coll', function(err, collection) {
          test.equal(null, err);
          var COUNT = 1000;

          function insert(callback) {
            var docs = [];

            for (var i = 0; i < COUNT; i++) {
              docs.push({ a: i });
            }

            collection.insertMany(docs, configuration.writeConcernMax(), callback);
          }

          function finished() {
            collection.count(function(err, count) {
              test.equal(null, err);
              test.equal(1000, count);
            });

            var total = 0;
            collection.find().each(function(err, item) {
              test.equal(null, err);
              if (item != null) {
                total = total + item.a;
              } else {
                test.equal(499500, total);

                collection.count(function(err, count) {
                  test.equal(null, err);
                  test.equal(1000, count);
                });

                collection.count(function(err, count) {
                  test.equal(null, err);
                  test.equal(1000, count);

                  var total2 = 0;
                  collection.find().each(function(err, item) {
                    test.equal(null, err);
                    if (item != null) {
                      total2 = total2 + item.a;
                    } else {
                      test.equal(499500, total2);
                      collection.count(function(err, count) {
                        test.equal(null, err);
                        test.equal(1000, count);
                        test.equal(total, total2);

                        // Let's close the db
                        client.close();
                        done();
                      });
                    }
                  });
                });
              }
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCloseCursorAfterQueryHasBeenSent', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_close_after_query_sent', function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var cursor = collection.find({ a: 1 });
            cursor.next(function(err) {
              test.equal(null, err);

              cursor.close(function(err, cursor) {
                test.equal(null, err);
                test.equal(true, cursor.isClosed());
                // Let's close the db
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
   * @api private
   */
  it('shouldCorrectlyExecuteCursorCountWithFields', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_count_with_fields', function(err, collection) {
          test.equal(null, err);

          collection.save({ x: 1, a: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection
              .find({})
              .project({ a: 1 })
              .toArray(function(err, items) {
                test.equal(null, err);
                test.equal(1, items.length);
                test.equal(2, items[0].a);
                test.equal(undefined, items[0].x);
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
   * @api private
   */
  it('shouldCorrectlyCountWithFieldsUsingExclude', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('test_count_with_fields_using_exclude', function(err, collection) {
          test.equal(null, err);

          collection.save({ x: 1, a: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.find({}, { fields: { x: 0 } }).toArray(function(err, items) {
              test.equal(null, err);
              test.equal(1, items.length);
              test.equal(2, items[0].a);
              test.equal(undefined, items[0].x);
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
   * @api private
   */
  it('Should correctly execute count on cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_execute_count_on_cursor_1', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var total = 0;
            // Create a cursor for the content
            var cursor = collection.find({});
            cursor.count(function(err) {
              test.equal(null, err);
              // Ensure each returns all documents
              cursor.each(function(err, item) {
                test.equal(null, err);
                if (item != null) {
                  total++;
                } else {
                  cursor.count(function(err, c) {
                    test.equal(null, err);
                    test.equal(1000, c);
                    test.equal(1000, total);
                    client.close();
                    done();
                  });
                }
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('should be able to stream documents', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        docs[i] = { a: i + 1 };
      }

      var count = 0;

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_be_able_to_stream_documents', function(err, collection) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var paused = 0,
              closed = 0,
              resumed = 0,
              i = 0;

            var stream = collection.find().stream();

            stream.on('data', function(doc) {
              test.equal(true, !!doc);
              test.equal(true, !!doc.a);
              count = count + 1;

              if (paused > 0 && 0 === resumed) {
                err = new Error('data emitted during pause');
                return testDone();
              }

              if (++i === 3) {
                stream.pause();
                paused++;

                setTimeout(function() {
                  stream.resume();
                  resumed++;
                }, 20);
              }
            });

            stream.once('error', function(er) {
              err = er;
              testDone();
            });

            stream.once('end', function() {
              closed++;
              testDone();
            });

            function testDone() {
              test.equal(null, err);
              test.equal(i, docs.length);
              test.equal(1, closed);
              test.equal(1, paused);
              test.equal(1, resumed);
              test.strictEqual(stream.isClosed(), true);
              client.close();
              done();
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('immediately destroying a stream prevents the query from executing', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var i = 0,
        docs = [{ b: 2 }, { b: 3 }],
        doneCalled = 0;

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection(
          'immediately_destroying_a_stream_prevents_the_query_from_executing',
          function(err, collection) {
            test.equal(null, err);

            // insert all docs
            collection.insert(docs, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              var stream = collection.find().stream();

              stream.on('data', function() {
                i++;
              });

              stream.once('close', testDone('close'));
              stream.once('error', testDone('error'));

              stream.destroy();

              function testDone() {
                return function(err) {
                  ++doneCalled;

                  if (doneCalled === 1) {
                    test.equal(undefined, err);
                    test.strictEqual(0, i);
                    test.strictEqual(true, stream.isClosed());
                    client.close();
                    done();
                  }
                };
              }
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('destroying a stream stops it', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.createCollection('destroying_a_stream_stops_it', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii + 1 });

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var finished = 0,
              i = 0;

            var stream = collection.find().stream();

            test.strictEqual(false, stream.isClosed());

            stream.on('data', function() {
              if (++i === 5) {
                stream.destroy();
              }
            });

            stream.once('close', testDone);
            stream.once('error', testDone);

            function testDone(err) {
              ++finished;
              setTimeout(function() {
                test.strictEqual(undefined, err);
                test.strictEqual(5, i);
                test.strictEqual(1, finished);
                test.strictEqual(true, stream.isClosed());
                client.close();
                done();
              }, 150);
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  // NOTE: skipped for use of topology manager
  it.skip('cursor stream errors', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.createCollection('cursor_stream_errors', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii + 1 });

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var finished = 0,
              i = 0;

            var stream = collection.find({}, { batchSize: 5 }).stream();

            stream.on('data', function() {
              if (++i === 4) {
                // Force restart
                configuration.manager.stop(9);
              }
            });

            stream.once('close', testDone('close'));
            stream.once('error', testDone('error'));

            function testDone() {
              return function() {
                ++finished;

                if (finished === 2) {
                  setTimeout(function() {
                    test.equal(5, i);
                    test.equal(true, stream.isClosed());
                    client.close();

                    configuration.manager.start().then(function() {
                      done();
                    });
                  }, 150);
                }
              };
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('cursor stream errors connection force closed', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '<=3.5.0', // NOTE: remove this when SERVER-30576 is resolved
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.createCollection('cursor_stream_errors', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii + 1 });

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var finished = 0,
              i = 0;

            var stream = collection.find({}, { batchSize: 5 }).stream();

            stream.on('data', function() {
              if (++i === 5) {
                client.topology
                  .connections()[0]
                  .write(Buffer.from('312312321321askdjljsaNCKnablibh'));
              }
            });

            stream.once('close', testDone('close'));
            stream.once('error', testDone('error'));

            function testDone() {
              return function() {
                ++finished;

                if (finished === 2) {
                  setTimeout(function() {
                    test.equal(5, i);
                    test.equal(2, finished);
                    test.equal(true, stream.isClosed());
                    client.close();
                    done();
                  }, 150);
                }
              };
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('cursor stream pipe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('cursor_stream_pipe', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          'Aaden Aaron Adrian Aditya Bob Joe'.split(' ').forEach(function(name) {
            docs.push({ name: name });
          });

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var filename = '/tmp/_nodemongodbnative_stream_out.txt',
              out = fs.createWriteStream(filename);

            // hack so we don't need to create a stream filter just to
            // stringify the objects (otherwise the created file would
            // just contain a bunch of [object Object])
            // var toString = Object.prototype.toString;
            // Object.prototype.toString = function () {
            //   return JSON.stringify(this);
            // }

            var stream = collection.find().stream({
              transform: function(doc) {
                return JSON.stringify(doc);
              }
            });

            stream.pipe(out);
            // Wait for output stream to close
            out.on('close', testDone);

            function testDone(err) {
              // Object.prototype.toString = toString;
              test.strictEqual(undefined, err);
              var contents = fs.readFileSync(filename, 'utf8');
              test.ok(/Aaden/.test(contents));
              test.ok(/Aaron/.test(contents));
              test.ok(/Adrian/.test(contents));
              test.ok(/Aditya/.test(contents));
              test.ok(/Bob/.test(contents));
              test.ok(/Joe/.test(contents));
              fs.unlinkSync(filename);
              client.close();
              done();
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCloseDeadTailableCursors', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] },
      sessions: { skipLeakTests: true }
    },

    // The actual test we wish to run
    test: function(done) {
      // http://www.mongodb.org/display/DOCS/Tailable+Cursors

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 10000000 };
        db.createCollection('test_if_dead_tailable_cursors_close', options, function(
          err,
          collection
        ) {
          test.equal(null, err);

          var closeCount = 0;
          var errorOccurred = false;

          var count = 100;
          // Just hammer the server
          for (var i = 0; i < 100; i++) {
            collection.insert({ id: i }, { w: 'majority', wtimeout: 5000 }, function(err) {
              test.equal(null, err);
              count = count - 1;

              if (count === 0) {
                var stream = collection.find({}, { tailable: true, awaitData: true }).stream();
                // let index = 0;
                stream.resume();

                stream.on('error', function(err) {
                  expect(err).to.exist;
                  errorOccurred = true;
                });

                var validator = () => {
                  closeCount++;
                  if (closeCount === 2) {
                    expect(errorOccurred).to.equal(true);
                    done();
                  }
                };

                stream.on('end', validator);
                stream.on('close', validator);

                // Just hammer the server
                for (var i = 0; i < 100; i++) {
                  const id = i;
                  process.nextTick(function() {
                    collection.insert({ id }, function(err) {
                      test.equal(null, err);

                      if (id === 99) {
                        setTimeout(() => client.close());
                      }
                    });
                  });
                }
              }
            });
          }
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldAwaitData', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      // http://www.mongodb.org/display/DOCS/Tailable+Cursors

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 8 };
        db.createCollection('should_await_data', options, function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create cursor with awaitdata, and timeout after the period specified
            var cursor = collection.find({}, { tailable: true, awaitdata: true });
            // Execute each
            cursor.each(function(err, result) {
              if (result) {
                cursor.kill();
              }

              if (err != null) {
                // Even though cursor is exhausted, should not close session
                // // unless cursor is manually closed, due to awaitdata / tailable
                cursor.close();
                client.close();
                done();
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldAwaitDataWithDocumentsAvailable', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      // http://www.mongodb.org/display/DOCS/Tailable+Cursors

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 8 };
        db.createCollection('should_await_data_no_docs', options, function(err, collection) {
          test.equal(null, err);

          // Create cursor with awaitdata, and timeout after the period specified
          var cursor = collection.find({}, { tailable: true, awaitdata: true });
          var rewind = cursor.rewind;
          var called = false;
          cursor.rewind = function() {
            called = true;
          };

          cursor.each(function(err) {
            if (err != null) {
              test.ok(called);
              cursor.rewind = rewind;
              client.close();
              done();
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldAwaitDataUsingCursorFlag', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      // http://www.mongodb.org/display/DOCS/Tailable+Cursors

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 8 };
        db.createCollection('should_await_data_cursor_flag', options, function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            // Create cursor with awaitdata, and timeout after the period specified
            var cursor = collection.find({}, {});
            cursor.addCursorFlag('tailable', true);
            cursor.addCursorFlag('awaitData', true);
            cursor.each(function(err) {
              if (err != null) {
                // Even though cursor is exhausted, should not close session
                // unless cursor is manually closed, due to awaitdata / tailable
                cursor.close();
                client.close();
                done();
              } else {
                cursor.kill();
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  /*
  it('shouldNotAwaitDataWhenFalse = {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      // NODE-98
      var db = configuration.newClient(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

      db.open(function(err, db) {
        var options = { capped: true, size: 8};
        db.createCollection('should_not_await_data_when_false', options, function(err, collection) {
          collection.insert({a:1}, configuration.writeConcernMax(), function(err, result) {
            // should not timeout
            collection.find({}, {tailable:true, awaitdata:false}).each(function(err, result) {
              test.ok(err != null);
            });

            client.close();
            done();
          });
        });
      });
    }
  }
  */

  /**
   * @ignore
   */
  it('Should correctly retry tailable cursor connection', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      // http://www.mongodb.org/display/DOCS/Tailable+Cursors

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 8 };
        db.createCollection('should_await_data', options, function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create cursor with awaitdata, and timeout after the period specified
            var cursor = collection.find({}, { tailable: true, awaitdata: true });
            cursor.each(function(err) {
              if (err != null) {
                // kill cursor b/c cursor is tailable / awaitable
                cursor.close();
                client.close();
                done();
              } else {
                cursor.kill();
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectExecuteExplainHonoringLimit', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];
      docs[0] = {
        _keywords: [
          'compact',
          'ii2gd',
          'led',
          '24-48v',
          'presse-etoupe',
          'bexbgl1d24483',
          'flash',
          '48v',
          'eexd',
          'feu',
          'presse',
          'compris',
          'rouge',
          'etoupe',
          'iic',
          'ii2gdeexdiict5',
          'red',
          'aet'
        ]
      };
      docs[1] = {
        _keywords: [
          'reducteur',
          '06212',
          'd20/16',
          'manch',
          'd20',
          'manchon',
          'ard',
          'sable',
          'irl',
          'red'
        ]
      };
      docs[2] = {
        _keywords: [
          'reducteur',
          '06214',
          'manch',
          'd25/20',
          'd25',
          'manchon',
          'ard',
          'sable',
          'irl',
          'red'
        ]
      };
      docs[3] = {
        _keywords: [
          'bar',
          'rac',
          'boite',
          '6790178',
          '50-240/4-35',
          '240',
          'branch',
          'coulee',
          'ddc',
          'red',
          'ip2x'
        ]
      };
      docs[4] = {
        _keywords: [
          'bar',
          'ip2x',
          'boite',
          '6790158',
          'ddi',
          '240',
          'branch',
          'injectee',
          '50-240/4-35?',
          'red'
        ]
      };
      docs[5] = {
        _keywords: [
          'bar',
          'ip2x',
          'boite',
          '6790179',
          'coulee',
          '240',
          'branch',
          'sdc',
          '50-240/4-35?',
          'red',
          'rac'
        ]
      };
      docs[6] = {
        _keywords: [
          'bar',
          'ip2x',
          'boite',
          '6790159',
          '240',
          'branch',
          'injectee',
          '50-240/4-35?',
          'sdi',
          'red'
        ]
      };
      docs[7] = {
        _keywords: [
          '6000',
          'r-6000',
          'resin',
          'high',
          '739680',
          'red',
          'performance',
          'brd',
          'with',
          'ribbon',
          'flanges'
        ]
      };
      docs[8] = { _keywords: ['804320', 'for', 'paint', 'roads', 'brd', 'red'] };
      docs[9] = { _keywords: ['38mm', 'padlock', 'safety', '813594', 'brd', 'red'] };
      docs[10] = { _keywords: ['114551', 'r6900', 'for', 'red', 'bmp71', 'brd', 'ribbon'] };
      docs[11] = {
        _keywords: ['catena', 'diameter', '621482', 'rings', 'brd', 'legend', 'red', '2mm']
      };
      docs[12] = {
        _keywords: ['catena', 'diameter', '621491', 'rings', '5mm', 'brd', 'legend', 'red']
      };
      docs[13] = {
        _keywords: ['catena', 'diameter', '621499', 'rings', '3mm', 'brd', 'legend', 'red']
      };
      docs[14] = {
        _keywords: ['catena', 'diameter', '621508', 'rings', '5mm', 'brd', 'legend', 'red']
      };
      docs[15] = {
        _keywords: [
          'insert',
          'for',
          'cable',
          '3mm',
          'carrier',
          '621540',
          'blank',
          'brd',
          'ademark',
          'red'
        ]
      };
      docs[16] = {
        _keywords: [
          'insert',
          'for',
          'cable',
          '621544',
          '3mm',
          'carrier',
          'brd',
          'ademark',
          'legend',
          'red'
        ]
      };
      docs[17] = {
        _keywords: ['catena', 'diameter', '6mm', '621518', 'rings', 'brd', 'legend', 'red']
      };
      docs[18] = {
        _keywords: ['catena', 'diameter', '621455', '8mm', 'rings', 'brd', 'legend', 'red']
      };
      docs[19] = {
        _keywords: ['catena', 'diameter', '621464', 'rings', '5mm', 'brd', 'legend', 'red']
      };

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        // Insert all the docs
        var collection = db.collection('shouldCorrectExecuteExplainHonoringLimit');
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          collection.ensureIndex({ _keywords: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection
              .find({ _keywords: 'red' }, {}, { explain: true })
              .limit(10)
              .toArray(function(err, result) {
                test.equal(null, err);
                test.ok(result != null);

                collection
                  .find({ _keywords: 'red' }, {})
                  .limit(10)
                  .explain(function(err, result) {
                    test.equal(null, err);
                    test.ok(result != null);

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
  it('shouldNotExplainWhenFalse', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var doc = { name: 'camera', _keywords: ['compact', 'ii2gd', 'led', 'red', 'aet'] };

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var collection = db.collection('shouldNotExplainWhenFalse');
        collection.insert(doc, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          collection
            .find({ _keywords: 'red' }, {}, { explain: false })
            .limit(10)
            .toArray(function(err, result) {
              test.equal(null, err);

              test.equal('camera', result[0].name);
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
  it('shouldFailToSetReadPreferenceOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        try {
          db
            .collection('shouldFailToSetReadPreferenceOnCursor')
            .find()
            .setReadPreference('notsecondary');
          test.ok(false);
        } catch (err) {} // eslint-disable-line

        db
          .collection('shouldFailToSetReadPreferenceOnCursor')
          .find()
          .setReadPreference('secondary');

        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldNotFailDueToStackOverflowEach', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('shouldNotFailDueToStackOverflowEach', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          var total = 0;
          for (var i = 0; i < 30000; i++) docs.push({ a: i });
          var allDocs = [];
          var left = 0;

          while (docs.length > 0) {
            allDocs.push(docs.splice(0, 1000));
          }
          // Get all batches we must insert
          left = allDocs.length;
          var totalI = 0;

          // Execute inserts
          for (i = 0; i < left; i++) {
            collection.insert(allDocs.shift(), configuration.writeConcernMax(), function(err, d) {
              test.equal(null, err);

              left = left - 1;
              totalI = totalI + d.length;

              if (left === 0) {
                collection.find({}).each(function(err, item) {
                  test.equal(null, err);
                  if (item == null) {
                    test.equal(30000, total);
                    client.close();
                    done();
                  } else {
                    total++;
                  }
                });
              }
            });
          }
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldNotFailDueToStackOverflowToArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('shouldNotFailDueToStackOverflowToArray', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          for (var i = 0; i < 30000; i++) docs.push({ a: i });
          var allDocs = [];
          var left = 0;

          while (docs.length > 0) {
            allDocs.push(docs.splice(0, 1000));
          }
          // Get all batches we must insert
          left = allDocs.length;
          var totalI = 0;
          var timeout = 0;

          // Execute inserts
          for (i = 0; i < left; i++) {
            setTimeout(function() {
              collection.insert(allDocs.shift(), configuration.writeConcernMax(), function(err, d) {
                test.equal(null, err);

                left = left - 1;
                totalI = totalI + d.length;

                if (left === 0) {
                  collection.find({}).toArray(function(err, items) {
                    test.equal(null, err);

                    test.equal(30000, items.length);
                    client.close();
                    done();
                  });
                }
              });
            }, timeout);
            timeout = timeout + 100;
          }
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlySkipAndLimit', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var collection = db.collection('shouldCorrectlySkipAndLimit');
        var docs = [];
        for (var i = 0; i < 100; i++) docs.push({ a: i, OrderNumber: i });

        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          collection
            .find({}, { OrderNumber: 1 })
            .skip(10)
            .limit(10)
            .toArray(function(err, items) {
              test.equal(null, err);
              test.equal(10, items[0].OrderNumber);

              collection
                .find({}, { OrderNumber: 1 })
                .skip(10)
                .limit(10)
                .count(true, function(err, count) {
                  test.equal(null, err);
                  test.equal(10, count);
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
   * @api private
   */
  it('shouldFailToTailANormalCollection', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var collection = db.collection('shouldFailToTailANormalCollection');
        var docs = [];
        for (var i = 0; i < 100; i++) docs.push({ a: i, OrderNumber: i });

        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          const cursor = collection.find({}, { tailable: true });
          cursor.each(function(err) {
            test.ok(err instanceof Error);
            test.ok(typeof err.code === 'number');

            // Close cursor b/c we did not exhaust cursor
            cursor.close();
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
  it('shouldCorrectlyUseFindAndCursorCount', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      // Establish connection to db
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);

        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        db.createCollection('test_close_function_on_cursor_2', function(err, collection) {
          test.equal(null, err);

          // Insert documents into collection
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.find({}, function(err, cursor) {
              test.equal(null, err);

              cursor.count(function(err, count) {
                test.equal(null, err);
                test.equal(100, count);

                client.close();
                done();
              });
            });
          });
        });
      });
      // DOC_END
    }
  });

  /**
   * @ignore
   */
  it('should correctly apply hint to count command for cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>2.5.5'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      // Establish connection to db
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var col = db.collection('count_hint');

        col.insert([{ i: 1 }, { i: 2 }], { w: 1 }, function(err) {
          test.equal(null, err);

          col.ensureIndex({ i: 1 }, function(err) {
            test.equal(null, err);

            col.find({ i: 1 }, { hint: '_id_' }).count(function(err, count) {
              test.equal(null, err);
              test.equal(1, count);

              col.find({}, { hint: '_id_' }).count(function(err, count) {
                test.equal(null, err);
                test.equal(2, count);

                col.find({ i: 1 }, { hint: 'BAD HINT' }).count(function(err) {
                  test.ok(err != null);

                  col.ensureIndex({ x: 1 }, { sparse: true }, function(err) {
                    test.equal(null, err);

                    col.find({ i: 1 }, { hint: 'x_1' }).count(function(err, count) {
                      test.equal(null, err);
                      test.equal(0, count);

                      col.find({}, { hint: 'i_1' }).count(function(err, count) {
                        test.equal(null, err);
                        test.equal(2, count);

                        client.close();
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
      // DOC_END
    }
  });

  /**
   * @ignore
   */
  it('Terminate each after first document by returning false', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);

        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        db.createCollection('terminate_each_returning_false', function(err, collection) {
          test.equal(null, err);

          // Insert documents into collection
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            var finished = false;

            collection.find({}).each(function(err, doc) {
              test.equal(null, err);

              if (doc) {
                test.equal(finished, false);
                finished = true;

                client.close();
                done();
                return false;
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly handle maxTimeMS as part of findOne options', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var donkey = {
          color: 'brown'
        };

        db.collection('donkies').insertOne(donkey, function(err, result) {
          test.equal(null, err);

          var query = { _id: result.insertedId };
          var options = { maxTimeMS: 1000 };

          db.collection('donkies').findOne(query, options, function(err, doc) {
            test.equal(null, err);
            test.equal('brown', doc.color);

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
  it('Should correctly handle batchSize of 2', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db
          .collection('should_correctly_handle_batchSize_2')
          .insert([{ x: 1 }, { x: 2 }, { x: 3 }], function(err) {
            test.equal(null, err);

            db
              .collection('should_correctly_handle_batchSize_2')
              .find({}, { batchSize: 2 }, function(error, cursor) {
                test.equal(null, err);

                cursor.next(function(err) {
                  test.equal(null, err);

                  cursor.next(function(err) {
                    test.equal(null, err);

                    cursor.next(function(err) {
                      client.close();
                      test.equal(null, err);
                      done();
                    });
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
  it('Should report database name and collection name', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.collection('myCollection').find({}, function(error, cursor) {
          test.equal(null, err);
          test.equal('myCollection', cursor.namespace.collection);
          test.equal('integration_tests', cursor.namespace.database);

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('Should correctly execute count on cursor with maxTimeMS', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_execute_count_on_cursor_2', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create a cursor for the content
            var cursor = collection.find({});
            cursor.limit(100);
            cursor.skip(10);
            cursor.count(true, { maxTimeMS: 1000 }, function(err) {
              test.equal(null, err);

              // Create a cursor for the content
              var cursor = collection.find({});
              cursor.limit(100);
              cursor.skip(10);
              cursor.maxTimeMS(100);
              cursor.count(function(err) {
                test.equal(null, err);

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
   * @api private
   */
  it('Should correctly execute count on cursor with maxTimeMS set using legacy method', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_execute_count_on_cursor_3', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create a cursor for the content
            var cursor = collection.find({}, { maxTimeMS: 100 });
            cursor.toArray(function(err) {
              test.equal(null, err);

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
   * @api private
   */
  it('Should correctly apply map to toArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('map_toArray');

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Create a cursor for the content
          var cursor = collection
            .find({})
            .map(function() {
              return { a: 1 };
            })
            .batchSize(5)
            .limit(10);

          cursor.toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(10, docs.length);

            // Ensure all docs where mapped
            docs.forEach(function(x) {
              test.equal(1, x.a);
            });

            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('Should correctly apply map to next', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('map_next');

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Create a cursor for the content
          var cursor = collection
            .find({})
            .map(function() {
              return { a: 1 };
            })
            .batchSize(5)
            .limit(10);

          cursor.next(function(err, doc) {
            test.equal(null, err);
            test.equal(1, doc.a);

            // Close cursor b/c we did not exhaust cursor
            cursor.close();
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('Should correctly apply map to each', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('map_each');

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Create a cursor for the content
          var cursor = collection
            .find({})
            .map(function() {
              return { a: 1 };
            })
            .batchSize(5)
            .limit(10);

          cursor.each(function(err, doc) {
            test.equal(null, err);

            if (doc) {
              test.equal(1, doc.a);
            } else {
              client.close();
              done();
            }
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('Should correctly apply map to forEach', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('map_forEach');

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Create a cursor for the content
          var cursor = collection
            .find({})
            .map(function() {
              return { a: 2 };
            })
            .map(function(x) {
              return { a: x.a * x.a };
            })
            .batchSize(5)
            .limit(10);

          cursor.forEach(
            function(doc) {
              test.equal(4, doc.a);
            },
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

  /**
   * @ignore
   * @api private
   */
  it('Should correctly apply multiple uses of map and apply forEach', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1000; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('map_mapmapforEach');

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Create a cursor for the content
          var cursor = collection
            .find({})
            .map(function() {
              return { a: 1 };
            })
            .batchSize(5)
            .limit(10);

          cursor.forEach(
            function(doc) {
              test.equal(1, doc.a);
            },
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

  /**
   * @ignore
   * @api private
   */
  it('Should correctly apply skip and limit to large set of documents', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('cursor_limit_skip_correctly');

        // Insert x number of docs
        var ordered = collection.initializeUnorderedBulkOp();

        for (var i = 0; i < 6000; i++) {
          ordered.insert({ a: i });
        }

        ordered.execute({ w: 1 }, function(err) {
          test.equal(null, err);

          // Let's attempt to skip and limit
          collection
            .find({})
            .limit(2016)
            .skip(2016)
            .toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(2016, docs.length);

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
  it('should tail cursor using maxAwaitTimeMS for 3.2 or higher', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'], mongodb: '>3.1.9' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var options = { capped: true, size: 8 };
        db.createCollection('should_await_data_max_awaittime_ms', options, function(
          err,
          collection
        ) {
          test.equal(null, err);

          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            var s = new Date();
            // Create cursor with awaitdata, and timeout after the period specified
            var cursor = collection
              .find({})
              .addCursorFlag('tailable', true)
              .addCursorFlag('awaitData', true)
              .maxAwaitTimeMS(500);

            cursor.each(function(err, result) {
              test.equal(null, err);

              if (result) {
                setTimeout(function() {
                  cursor.kill();
                }, 300);
              } else {
                test.ok(new Date().getTime() - s.getTime() >= 500);
                client.close();
                done();
              }
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('Should not emit any events after close event emitted due to cursor killed', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        var collection = db.collection('cursor_limit_skip_correctly');

        // Insert x number of docs
        var ordered = collection.initializeUnorderedBulkOp();

        for (var i = 0; i < 100; i++) {
          ordered.insert({ a: i });
        }

        ordered.execute({ w: 1 }, function(err) {
          test.equal(null, err);

          // Let's attempt to skip and limit
          var cursor = collection.find({}).batchSize(10);
          cursor.on('data', function() {
            cursor.destroy();
          });

          cursor.on('close', function() {
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   * @api private
   */
  it('shouldCorrectlyExecuteEnsureIndexWithNoCallback', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 1; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlyExecuteEnsureIndexWithNoCallback', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // ensure index of createdAt index
          collection.ensureIndex({ createdAt: 1 }, function(err) {
            test.equal(null, err);

            // insert all docs
            collection.insert(docs, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              // Find with sort
              collection
                .find()
                .sort(['createdAt', 'asc'])
                .toArray(function(err, items) {
                  test.equal(null, err);

                  test.equal(1, items.length);
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
   * @api private
   */
  it('Should correctly execute count on cursor with limit and skip', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];

      for (var i = 0; i < 50; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_execute_count_on_cursor_1_', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create a cursor for the content
            var cursor = collection.find({});
            cursor
              .limit(100)
              .skip(0)
              .count(function(err, c) {
                test.equal(null, err);
                test.equal(50, c);

                var cursor = collection.find({});
                cursor
                  .limit(100)
                  .skip(0)
                  .toArray(function(err) {
                    test.equal(null, err);
                    test.equal(50, c);

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
   * @api private
   */
  it('Should correctly handle negative batchSize and set the limit', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var docs = [];
      var configuration = this.configuration;
      var Long = configuration.require.Long;

      for (var i = 0; i < 50; i++) {
        var d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_execute_count_on_cursor_1_', function(
          err,
          collection
        ) {
          test.equal(null, err);

          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create a cursor for the content
            var cursor = collection.find({});
            cursor.batchSize(-10).next(function(err) {
              test.equal(null, err);
              test.ok(cursor.cursorState.cursorId.equals(Long.ZERO));

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('Correcly decorate the cursor count command with skip, limit, hint, readConcern', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var started = [];
      var listener = require('../..').instrument(function(err) {
        test.equal(null, err);
      });

      listener.on('started', function(event) {
        if (event.commandName === 'count') started.push(event);
      });

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db
          .collection('cursor_count_test', { readConcern: { level: 'local' } })
          .find({ project: '123' })
          .limit(5)
          .skip(5)
          .hint({ project: 1 })
          .count(true, function(err) {
            test.equal(null, err);
            test.equal(1, started.length);
            if (started[0].command.readConcern)
              test.deepEqual({ level: 'local' }, started[0].command.readConcern);
            test.deepEqual({ project: 1 }, started[0].command.hint);
            test.equal(5, started[0].command.skip);
            test.equal(5, started[0].command.limit);

            listener.uninstrument();

            client.close();
            done();
          });
      });
    }
  });

  it('Correcly decorate the collection cursor count command with skip, limit, hint, readConcern', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var started = [];

      var listener = require('../..').instrument(function(err) {
        test.equal(null, err);
      });

      listener.on('started', function(event) {
        if (event.commandName === 'count') started.push(event);
      });

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.collection('cursor_count_test1', { readConcern: { level: 'local' } }).count(
          {
            project: '123'
          },
          {
            readConcern: { level: 'local' },
            limit: 5,
            skip: 5,
            hint: { project: 1 }
          },
          function(err) {
            test.equal(null, err);
            test.equal(1, started.length);
            if (started[0].command.readConcern)
              test.deepEqual({ level: 'local' }, started[0].command.readConcern);
            test.deepEqual({ project: 1 }, started[0].command.hint);
            test.equal(5, started[0].command.skip);
            test.equal(5, started[0].command.limit);

            listener.uninstrument();

            client.close();
            done();
          }
        );
      });
    }
  });

  it('Should properly kill a cursor', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.2.0'
      }
    },

    // The actual test we wish to run
    test: function() {
      // Load up the documents
      const docs = [];
      for (let i = 0; i < 1000; i += 1) {
        docs.push({
          a: i
        });
      }

      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      let cleanup = () => {};
      let caughtError = undefined;

      return (
        client
          // Connect
          .connect()
          .then(function(client) {
            cleanup = () => client.close();
            const db = client.db(configuration.db);
            const collection = db.collection('cursorkilltest1');

            // Insert 1000 documents
            return collection.insert(docs).then(() => {
              // Generate cursor for find operation
              const cursor = collection.find({});

              // Iterate cursor past first element
              return cursor
                .next()
                .then(() => cursor.next())
                .then(() => {
                  // Confirm that cursorId is non-zero
                  const longId = cursor.cursorState.cursorId;
                  expect(longId)
                    .to.be.an('object')
                    .and.to.haveOwnProperty('_bsontype', 'Long');
                  const id = longId.toNumber();

                  expect(id).to.not.equal(0);

                  // Kill cursor
                  return new Promise((resolve, reject) =>
                    cursor.kill((err, r) => (err ? reject(err) : resolve(r)))
                  ).then(response => {
                    // sharded clusters will return a long, single return integers
                    if (
                      response &&
                      response.cursorsKilled &&
                      Array.isArray(response.cursorsKilled)
                    ) {
                      response.cursorsKilled = response.cursorsKilled.map(
                        id => (typeof id === 'number' ? Long.fromNumber(id) : id)
                      );
                    }

                    expect(response.ok).to.equal(1);
                    expect(response.cursorsKilled[0].equals(longId)).to.be.ok;
                    cursor.close();
                    client.close();
                  });
                });
            });
          })

          // Clean up. Make sure that even in case of error, we still always clean up connection
          .catch(e => (caughtError = e))
          .then(cleanup)
          .then(() => {
            if (caughtError) {
              throw caughtError;
            }
          })
      );
    }
  });

  // NOTE: This is skipped because I don't think its correct or adds value. The expected error
  //       is not an error with hasNext (from server), but rather a local TypeError which should
  //       be caught anyway. The only solution here would be to wrap the entire top level call
  //       in a try/catch which is not going to happen.
  it.skip('Should propagate hasNext errors when using a callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var findCommand = {
          find: 'integration_tests.has_next_error_callback',
          limit: 0,
          skip: 0,
          query: {},
          slaveOk: false
        };

        var cursor = db.s.topology.cursor(db.s.namespace, findCommand, { readPreference: 42 });
        cursor.hasNext(function(err) {
          test.ok(err !== null);
          test.equal(err.message, 'readPreference must be a ReadPreference instance');
          done();
        });
      });
    }
  });

  it(
    'should return implicit session to pool when client-side cursor exhausts results on initial query',
    {
      metadata: {
        requires: {
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
          mongodb: '>=3.6.0'
        }
      },
      test: function(done) {
        const configuration = this.configuration;
        const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

        client.connect(function(err, client) {
          test.equal(null, err);

          const db = client.db(configuration.db);
          const collection = db.collection('cursor_session_tests');

          collection.insertMany([{ a: 1, b: 2 }], function(err) {
            test.equal(null, err);
            const cursor = collection.find({});

            cursor.next(function() {
              test.equal(client.topology.s.sessions.length, 0);
              client.close();
              done();
            });
          });
        });
      }
    }
  );

  it(
    'should return implicit session to pool when client-side cursor exhausts results after a getMore',
    {
      metadata: {
        requires: {
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
          mongodb: '>=3.6.0'
        }
      },
      test: function(done) {
        const configuration = this.configuration;
        const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

        client.connect(function(err, client) {
          test.equal(null, err);

          const db = client.db(configuration.db);
          const collection = db.collection('cursor_session_tests2');

          const docs = [
            { a: 1, b: 2 },
            { a: 3, b: 4 },
            { a: 5, b: 6 },
            { a: 7, b: 8 },
            { a: 9, b: 10 }
          ];

          collection.insertMany(docs, function(err) {
            test.equal(null, err);
            const cursor = collection.find({}, { batchSize: 3 });
            cursor.next(function() {
              test.equal(client.topology.s.sessions.length, 1);
              cursor.next(function() {
                test.equal(client.topology.s.sessions.length, 1);
                cursor.next(function() {
                  test.equal(client.topology.s.sessions.length, 1);
                  cursor.next(function() {
                    test.equal(client.topology.s.sessions.length, 0);
                    client.close();
                    done();
                  });
                });
              });
            });
          });
        });
      }
    }
  );

  it('should return a promise when no callback supplied to forEach method', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

    client.connect(function(err, client) {
      const db = client.db(configuration.db);
      const collection = db.collection('cursor_session_tests2');

      const cursor = collection.find();
      expect(cursor.forEach()).to.exist.and.to.be.an.instanceof(cursor.s.promiseLibrary);
      cursor.close(() => client.close(() => done()));
    });
  });

  it('should return false when exhausted and hasNext called more than once', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

    client.connect(function(err, client) {
      const db = client.db(configuration.db);

      db.createCollection('cursor_hasNext_test').then(function() {
        const cursor = db.collection('cursor_hasNext_test').find();

        cursor
          .hasNext()
          .then(function(val1) {
            expect(val1).to.equal(false);
            return cursor.hasNext();
          })
          .then(function(val2) {
            expect(val2).to.equal(false);
            cursor.close(() => client.close(() => done()));
          })
          .catch(err => {
            cursor.close(() => client.close(() => done(err)));
          });
      });
    });
  });

  function testTransformStream(config, done) {
    const client = config.client;
    const configuration = config.configuration;
    const collectionName = config.collectionName;
    const transformFunc = config.transformFunc;
    const expectedSet = config.expectedSet;

    client.connect(function(err, client) {
      const db = client.db(configuration.db);
      let collection, cursor;
      const docs = [
        { _id: 0, a: { b: 1, c: 0 } },
        { _id: 1, a: { b: 1, c: 0 } },
        { _id: 2, a: { b: 1, c: 0 } }
      ];
      const resultSet = new Set();
      const transformParam = transformFunc != null ? { transform: transformFunc } : null;
      const close = e => cursor.close(() => client.close(() => done(e)));

      Promise.resolve()
        .then(() => db.createCollection(collectionName))
        .then(() => (collection = db.collection(collectionName)))
        .then(() => collection.insertMany(docs))
        .then(() => collection.find())
        .then(_cursor => (cursor = _cursor))
        .then(() => cursor.transformStream(transformParam))
        .then(stream => {
          stream.on('data', function(doc) {
            resultSet.add(doc);
          });

          stream.once('end', function() {
            expect(resultSet).to.deep.equal(expectedSet);
            close();
          });

          stream.once('error', function(e) {
            close(e);
          });
        })
        .catch(e => close(e));
    });
  }

  it('transformStream should apply the supplied transformation function to each document in the stream', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
    const expectedDocs = [{ _id: 0, b: 1, c: 0 }, { _id: 1, b: 1, c: 0 }, { _id: 2, b: 1, c: 0 }];
    const config = {
      client: client,
      configuration: configuration,
      collectionName: 'transformStream-test-transform',
      transformFunc: doc => ({ _id: doc._id, b: doc.a.b, c: doc.a.c }),
      expectedSet: new Set(expectedDocs)
    };

    testTransformStream(config, done);
  });

  it('transformStream should return a stream of unmodified docs if no transform function applied', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
    const expectedDocs = [
      { _id: 0, a: { b: 1, c: 0 } },
      { _id: 1, a: { b: 1, c: 0 } },
      { _id: 2, a: { b: 1, c: 0 } }
    ];
    const config = {
      client: client,
      configuration: configuration,
      collectionName: 'transformStream-test-notransform',
      transformFunc: null,
      expectedSet: new Set(expectedDocs)
    };

    testTransformStream(config, done);
  });

  it('should apply parent read preference to count command', function(done) {
    const configuration = this.configuration;
    const ReadPreference = this.configuration.require.ReadPreference;
    const client = configuration.newClient(
      { w: 1, readPreference: ReadPreference.SECONDARY },
      { poolSize: 1, auto_reconnect: false, connectWithNoPrimary: true }
    );

    client.connect(function(err, client) {
      expect(err).to.not.exist;

      const db = client.db(configuration.db);
      let collection, cursor, spy;
      const close = e => cursor.close(() => client.close(() => done(e)));

      Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(() => resolve(), 500)))
        .then(() => db.createCollection('test_count_readPreference'))
        .then(() => (collection = db.collection('test_count_readPreference')))
        .then(() => collection.find())
        .then(_cursor => (cursor = _cursor))
        .then(() => (spy = sinon.spy(cursor.s.topology, 'command')))
        .then(() => cursor.count())
        .then(() =>
          expect(spy.firstCall.args[2])
            .to.have.nested.property('readPreference.mode')
            .that.equals('secondary')
        )
        .then(() => close())
        .catch(e => close(e));
    });
  });
});
