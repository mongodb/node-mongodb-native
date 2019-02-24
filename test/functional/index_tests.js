'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Indexes', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyExtractIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_index_information', function(err, collection) {
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Create an index on the collection
            db.createIndex(
              collection.collectionName,
              'a',
              configuration.writeConcernMax(),
              function(err, indexName) {
                test.equal(null, err);
                test.equal('a_1', indexName);

                // Let's fetch the index information
                db.indexInformation(collection.collectionName, function(err, collectionInfo) {
                  test.equal(null, err);
                  test.ok(collectionInfo['_id_'] != null);
                  test.equal('_id', collectionInfo['_id_'][0][0]);
                  test.ok(collectionInfo['a_1'] != null);
                  test.deepEqual([['a', 1]], collectionInfo['a_1']);

                  db.indexInformation(collection.collectionName, function(err, collectionInfo2) {
                    var count1 = Object.keys(collectionInfo).length,
                      count2 = Object.keys(collectionInfo2).length;

                    // Tests
                    test.ok(count2 >= count1);
                    test.ok(collectionInfo2['_id_'] != null);
                    test.equal('_id', collectionInfo2['_id_'][0][0]);
                    test.ok(collectionInfo2['a_1'] != null);
                    test.deepEqual([['a', 1]], collectionInfo2['a_1']);
                    test.ok(collectionInfo[indexName] != null);
                    test.deepEqual([['a', 1]], collectionInfo[indexName]);

                    // Let's close the db
                    client.close();
                    done();
                  });
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleMultipleColumnIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_multiple_index_cols', function(err, collection) {
          collection.insert({ a: 1 }, function(err) {
            test.equal(null, err);
            // Create an index on the collection
            db.createIndex(
              collection.collectionName,
              [['a', -1], ['b', 1], ['c', -1]],
              configuration.writeConcernMax(),
              function(err, indexName) {
                test.equal('a_-1_b_1_c_-1', indexName);
                // Let's fetch the index information
                db.indexInformation(collection.collectionName, function(err, collectionInfo) {
                  var count1 = Object.keys(collectionInfo).length;

                  // Test
                  test.equal(2, count1);
                  test.ok(collectionInfo[indexName] != null);
                  test.deepEqual([['a', -1], ['b', 1], ['c', -1]], collectionInfo[indexName]);

                  // Let's close the db
                  client.close();
                  done();
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleUniqueIndex', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Create a non-unique index and test inserts
        db.createCollection('test_unique_index', function(err, collection) {
          db.createIndex(
            collection.collectionName,
            'hello',
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              // Insert some docs
              collection.insert(
                [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
                configuration.writeConcernMax(),
                function(err) {
                  test.equal(null, err);

                  // Create a unique index and test that insert fails
                  db.createCollection('test_unique_index2', function(err, collection) {
                    db.createIndex(
                      collection.collectionName,
                      'hello',
                      { unique: true, w: 1 },
                      function(err) {
                        test.equal(null, err);
                        // Insert some docs
                        collection.insert(
                          [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
                          configuration.writeConcernMax(),
                          function(err) {
                            test.ok(err != null);
                            test.equal(11000, err.code);
                            client.close();
                            done();
                          }
                        );
                      }
                    );
                  });
                }
              );
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyCreateSubfieldIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Create a non-unique index and test inserts
        db.createCollection('test_index_on_subfield', function(err, collection) {
          collection.insert(
            [{ hello: { a: 4, b: 5 } }, { hello: { a: 7, b: 2 } }, { hello: { a: 4, b: 10 } }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Create a unique subfield index and test that insert fails
              db.createCollection('test_index_on_subfield2', function(err, collection) {
                db.createIndex(
                  collection.collectionName,
                  'hello_a',
                  { w: 1, unique: true },
                  function(err) {
                    test.equal(null, err);

                    collection.insert(
                      [
                        { hello: { a: 4, b: 5 } },
                        { hello: { a: 7, b: 2 } },
                        { hello: { a: 4, b: 10 } }
                      ],
                      configuration.writeConcernMax(),
                      function(err) {
                        // Assert that we have erros
                        test.ok(err != null);
                        client.close();
                        done();
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyDropIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_drop_indexes', function(err, collection) {
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            // Create an index on the collection
            db.createIndex(
              collection.collectionName,
              'a',
              configuration.writeConcernMax(),
              function(err, indexName) {
                test.equal('a_1', indexName);
                // Drop all the indexes
                collection.dropAllIndexes(function(err, result) {
                  test.equal(true, result);

                  collection.indexInformation(function(err, result) {
                    test.ok(result['a_1'] == null);
                    client.close();
                    done();
                  });
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_distinct_queries', function(err, collection) {
          collection.insert(
            [
              { a: 0, b: { c: 'a' } },
              { a: 1, b: { c: 'b' } },
              { a: 1, b: { c: 'c' } },
              { a: 2, b: { c: 'a' } },
              { a: 3 },
              { a: 3 }
            ],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              collection.distinct('a', function(err, docs) {
                test.deepEqual([0, 1, 2, 3], docs.sort());

                collection.distinct('b.c', function(err, docs) {
                  test.deepEqual(['a', 'b', 'c'], docs.sort());
                  client.close();
                  done();
                });
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyExecuteEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_ensure_index', function(err, collection) {
          // Create an index on the collection
          db.ensureIndex(collection.collectionName, 'a', configuration.writeConcernMax(), function(
            err,
            indexName
          ) {
            test.equal('a_1', indexName);
            // Let's fetch the index information
            db.indexInformation(collection.collectionName, function(err, collectionInfo) {
              test.ok(collectionInfo['_id_'] != null);
              test.equal('_id', collectionInfo['_id_'][0][0]);
              test.ok(collectionInfo['a_1'] != null);
              test.deepEqual([['a', 1]], collectionInfo['a_1']);

              db.ensureIndex(
                collection.collectionName,
                'a',
                configuration.writeConcernMax(),
                function(err, indexName) {
                  test.equal('a_1', indexName);
                  // Let's fetch the index information
                  db.indexInformation(collection.collectionName, function(err, collectionInfo) {
                    test.ok(collectionInfo['_id_'] != null);
                    test.equal('_id', collectionInfo['_id_'][0][0]);
                    test.ok(collectionInfo['a_1'] != null);
                    test.deepEqual([['a', 1]], collectionInfo['a_1']);
                    // Let's close the db
                    client.close();
                    done();
                  });
                }
              );
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyCreateAndUseSparseIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('create_and_use_sparse_index_test', function(err) {
          test.equal(null, err);
          db.collection('create_and_use_sparse_index_test', function(err, collection) {
            collection.ensureIndex({ title: 1 }, { sparse: true, w: 1 }, function(err) {
              test.equal(null, err);
              collection.insert(
                [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
                configuration.writeConcernMax(),
                function(err) {
                  test.equal(null, err);
                  collection
                    .find({ title: { $ne: null } })
                    .sort({ title: 1 })
                    .toArray(function(err, items) {
                      test.equal(1, items.length);
                      test.equal('Sarah', items[0].name);

                      // Fetch the info for the indexes
                      collection.indexInformation({ full: true }, function(err, indexInfo) {
                        test.equal(null, err);
                        test.equal(2, indexInfo.length);
                        client.close();
                        done();
                      });
                    });
                }
              );
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleGeospatialIndexes', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.6.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('geospatial_index_test', function(err) {
          test.equal(null, err);
          db.collection('geospatial_index_test', function(err, collection) {
            collection.ensureIndex({ loc: '2d' }, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);
              collection.insert({ loc: [-100, 100] }, configuration.writeConcernMax(), function(
                err
              ) {
                test.equal(err, null);

                collection.insert({ loc: [200, 200] }, configuration.writeConcernMax(), function(
                  err
                ) {
                  test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
                  test.ok(err.errmsg.indexOf('-180') !== -1);
                  test.ok(err.errmsg.indexOf('180') !== -1);
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
   */
  it('shouldCorrectlyHandleGeospatialIndexesAlteredRange', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.6.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('geospatial_index_altered_test', function(err) {
          test.equal(null, err);
          db.collection('geospatial_index_altered_test', function(err, collection) {
            collection.ensureIndex({ loc: '2d' }, { min: 0, max: 1024, w: 1 }, function(err) {
              test.equal(null, err);
              collection.insert({ loc: [100, 100] }, configuration.writeConcernMax(), function(
                err
              ) {
                test.equal(err, null);
                collection.insert({ loc: [200, 200] }, configuration.writeConcernMax(), function(
                  err
                ) {
                  test.equal(err, null);
                  collection.insert(
                    { loc: [-200, -200] },
                    configuration.writeConcernMax(),
                    function(err) {
                      test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
                      test.ok(err.errmsg.indexOf('0') !== -1);
                      test.ok(err.errmsg.indexOf('1024') !== -1);
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
    }
  });

  /**
   * @ignore
   */
  it('shouldThrowDuplicateKeyErrorWhenCreatingIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldThrowDuplicateKeyErrorWhenCreatingIndex', function(
          err,
          collection
        ) {
          collection.insert([{ a: 1 }, { a: 1 }], configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.ensureIndex({ a: 1 }, { unique: true, w: 1 }, function(err) {
              test.ok(err != null);
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
  it('shouldThrowDuplicateKeyErrorWhenDriverInStrictMode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldThrowDuplicateKeyErrorWhenDriverInStrictMode', function(
          err,
          collection
        ) {
          collection.insert([{ a: 1 }, { a: 1 }], configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.ensureIndex({ a: 1 }, { unique: true, w: 1 }, function(err) {
              test.ok(err != null);
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
  it('shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Establish connection to db
        db.createCollection('shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex', function(
          err,
          collection
        ) {
          test.equal(null, err);

          collection.ensureIndex({ loc: '2d' }, { min: 200, max: 1400, w: 1 }, function(err) {
            test.equal(null, err);

            collection.insert({ loc: [600, 600] }, configuration.writeConcernMax(), function(err) {
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
   */
  it('Should correctly create an index with overriden name', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Establish connection to db
        db.createCollection('shouldCorrectlyCreateAnIndexWithOverridenName', function(
          err,
          collection
        ) {
          test.equal(null, err);

          collection.ensureIndex('name', { name: 'myfunky_name' }, function(err) {
            test.equal(null, err);

            // Fetch full index information
            collection.indexInformation({ full: false }, function(err, indexInformation) {
              test.ok(indexInformation['myfunky_name'] != null);
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('should handle index declarations using objects from other contexts', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var shared = require('./contexts');

        db
          .collection('indexcontext')
          .ensureIndex(shared.object, { background: true }, function(err) {
            test.equal(null, err);
            db
              .collection('indexcontext')
              .ensureIndex(shared.array, { background: true }, function(err) {
                test.equal(null, err);
                client.close();
                done();
              });
          });
      });
    }
  });

  it('should correctly return error message when applying unique index to duplicate documents', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('should_throw_error_due_to_duplicates');
        collection.insert([{ a: 1 }, { a: 1 }, { a: 1 }], configuration.writeConcernMax(), function(
          err
        ) {
          test.equal(null, err);

          collection.ensureIndex({ a: 1 }, { w: 1, unique: true }, function(err) {
            test.ok(err != null);
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should correctly drop index with no callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('should_correctly_drop_index');
        collection.insert([{ a: 1 }], configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          collection.ensureIndex({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            collection
              .dropIndex('a_1')
              .then(() => {
                client.close();
                done();
              })
              .catch(err => {
                client.close();
                done(err);
              });
          });
        });
      });
    }
  });

  it('should correctly apply hint to find', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('should_correctly_apply_hint');
        collection.insert([{ a: 1 }], configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          collection.ensureIndex({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.indexInformation({ full: false }, function(err) {
              test.equal(null, err);

              collection.find({}, { hint: 'a_1' }).toArray(function(err, docs) {
                test.equal(null, err);
                test.equal(1, docs[0].a);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  it('should correctly set language_override option', {
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('should_correctly_set_language_override');
        collection.insert([{ text: 'Lorem ipsum dolor sit amet.', langua: 'italian' }], function(
          err
        ) {
          test.equal(null, err);

          collection.ensureIndex(
            { text: 'text' },
            { language_override: 'langua', name: 'language_override_index' },
            function(err) {
              test.equal(null, err);

              collection.indexInformation({ full: true }, function(err, indexInformation) {
                test.equal(null, err);
                for (var i = 0; i < indexInformation.length; i++) {
                  if (indexInformation[i].name === 'language_override_index')
                    test.equal(indexInformation[i].language_override, 'langua');
                }

                client.close();
                done();
              });
            }
          );
        });
      });
    }
  });

  it('should correctly use listIndexes to retrieve index list', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('testListIndexes').ensureIndex({ a: 1 }, function(err) {
          test.equal(null, err);

          // Get the list of indexes
          db
            .collection('testListIndexes')
            .listIndexes()
            .toArray(function(err, indexes) {
              test.equal(null, err);
              test.equal(2, indexes.length);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('should correctly use listIndexes to retrieve index list using hasNext', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('testListIndexes_2').ensureIndex({ a: 1 }, function(err) {
          test.equal(null, err);

          // Get the list of indexes
          db
            .collection('testListIndexes_2')
            .listIndexes()
            .hasNext(function(err, result) {
              test.equal(null, err);
              test.equal(true, result);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('should correctly ensureIndex for nested style index name c.d', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('ensureIndexWithNestedStyleIndex').ensureIndex({ 'c.d': 1 }, function(err) {
          test.equal(null, err);

          // Get the list of indexes
          db
            .collection('ensureIndexWithNestedStyleIndex')
            .listIndexes()
            .toArray(function(err, indexes) {
              test.equal(null, err);
              test.equal(2, indexes.length);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('should correctly execute createIndexes', {
    metadata: {
      requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db
          .collection('createIndexes')
          .createIndexes([{ key: { a: 1 } }, { key: { b: 1 }, name: 'hello1' }], function(err, r) {
            test.equal(null, err);
            test.equal(3, r.numIndexesAfter);

            db
              .collection('createIndexes')
              .listIndexes()
              .toArray(function(err, docs) {
                test.equal(null, err);
                var keys = {};

                for (var i = 0; i < docs.length; i++) {
                  keys[docs[i].name] = true;
                }

                test.ok(keys['a_1']);
                test.ok(keys['hello1']);

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
  it('shouldCorrectlyCreateTextIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db
          .collection('text_index')
          .createIndex({ '$**': 'text' }, { name: 'TextIndex' }, function(err, r) {
            test.equal(null, err);
            test.equal('TextIndex', r);
            // Let's close the db
            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly pass partialIndexes through to createIndexCommand', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.1.8'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var started = [];
      var succeeded = [];
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      var listener = require('../..').instrument(function(err) {
        test.equal(null, err);
      });

      listener.on('started', function(event) {
        if (event.commandName === 'createIndexes') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'createIndexes') succeeded.push(event);
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db
          .collection('partialIndexes')
          .createIndex({ a: 1 }, { partialFilterExpression: { a: 1 } }, function(err) {
            test.equal(null, err);
            test.deepEqual({ a: 1 }, started[0].command.indexes[0].partialFilterExpression);
            listener.uninstrument();
            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should not retry partial index expression error', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>=3.1.8'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(error, client) {
        var db = client.db(configuration.db);
        test.equal(error, null);
        // Can't use $exists: false in partial filter expression, see
        // https://jira.mongodb.org/browse/SERVER-17853
        var opts = { partialFilterExpression: { a: { $exists: false } } };
        db.collection('partialIndexes').createIndex({ a: 1 }, opts, function(err) {
          test.ok(err);
          test.equal(err.code, 67);
          var msg = "key $exists must not start with '$'";
          test.ok(err.toString().indexOf(msg) === -1);

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly error out due to driver close', {
    metadata: {
      requires: { topology: ['single'] },
      sessions: { skipLeakTests: true }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The new topology type has loose concepts of 'closing' and 'opening' a client. It will
        // simply attempt here to retry the connection and reconnect, so this is a bad test for
        // the driver in that configuration.

        return this.skip();
      }

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        client.close(function() {
          setTimeout(() => {
            db.createCollection('nonexisting', { w: 1 }, function(err) {
              test.ok(err != null);
              db.collection('nonexisting', { strict: true }, function(err) {
                test.ok(err != null);
                db.collection('nonexisting', { strict: false }, function(err) {
                  // When set to false (default) it should not create an error
                  test.ok(err === null);
                  setTimeout(() => done());
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
  it('should correctly create index on embedded key', {
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
        var collection = db.collection('embedded_key_indes');

        collection.insertMany(
          [
            {
              a: { a: 1 }
            },
            {
              a: { a: 2 }
            }
          ],
          function(err) {
            test.equal(null, err);

            collection.ensureIndex({ 'a.a': 1 }, function(err) {
              test.equal(null, err);
              client.close();
              done();
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly create index using . keys', {
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
        var collection = db.collection('embedded_key_indes_1');
        collection.createIndex(
          { 'key.external_id': 1, 'key.type': 1 },
          { unique: true, sparse: true, name: 'indexname' },
          function(err) {
            test.equal(null, err);

            client.close();
            done();
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('error on duplicate key index', {
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
        var collection = db.collection('embedded_key_indes_2');
        collection.insertMany(
          [
            {
              key: { external_id: 1, type: 1 }
            },
            {
              key: { external_id: 1, type: 1 }
            }
          ],
          function(err) {
            test.equal(null, err);
            collection.createIndex(
              { 'key.external_id': 1, 'key.type': 1 },
              { unique: true, sparse: true, name: 'indexname' },
              function(err) {
                test.equal(11000, err.code);

                client.close();
                done();
              }
            );
          }
        );
      });
    }
  });

  // /**
  //  * @ignore
  //  */
  // it('should correctly return all indexes'] = {
  //   metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  //   // The actual test we wish to run
  //   test: function(done) {
  //     var db = configuration.newClient(configuration.writeConcernMax(), {poolSize:1});
  //     db.open(function(err, db) {
  //       db.createCollection('test_drop_indexes', function(err, collection) {
  //         collection.insert({a:1}, configuration.writeConcernMax(), function(err, ids) {
  //           // Create an index on the collection
  //           db.createIndex(collection.collectionName, 'a', configuration.writeConcernMax(), function(err, indexName) {
  //             test.equal("a_1", indexName);

  //             collection.indexes(function(err, indexes) {

  //               client.close();
  //               done();
  //             });

  //             // // Drop all the indexes
  //             // collection.dropAllIndexes(function(err, result) {
  //             //   test.equal(true, result);

  //             //   collection.indexInformation(function(err, result) {
  //             //     test.ok(result['a_1'] == null);
  //             //     client.close();
  //             //     done();
  //             //   })
  //             // })
  //           });
  //         })
  //       });
  //     });
  //   }
  // }

  /**
   * @ignore
   */
  it('should correctly create Index with sub element', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // insert a doc
        db
          .collection('messed_up_index')
          .createIndex(
            { temporary: 1, 'store.addressLines': 1, lifecycleStatus: 1 },
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              client.close();
              done();
            }
          );
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly fail detect error code 85 when performing createIndex', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.0.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('messed_up_options');

        collection.ensureIndex(
          { 'a.one': 1, 'a.two': 1 },
          { name: 'n1', partialFilterExpression: { 'a.two': { $exists: true } } },
          function(err) {
            test.equal(null, err);

            collection.ensureIndex(
              { 'a.one': 1, 'a.two': 1 },
              { name: 'n2', partialFilterExpression: { 'a.too': { $exists: true } } },
              function(err) {
                test.ok(err);
                test.equal(85, err.code);

                client.close();
                done();
              }
            );
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly fail by detecting error code 86 when performing createIndex', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.0.0'
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('messed_up_options');

        collection.createIndex({ 'b.one': 1, 'b.two': 1 }, { name: 'test' }, function(err) {
          test.equal(null, err);

          collection.createIndex({ 'b.one': -1, 'b.two': -1 }, { name: 'test' }, function(err) {
            test.ok(err);
            test.equal(86, err.code);

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
  it('should correctly create Index with sub element running in background', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // insert a doc
        db
          .collection('messed_up_index_2')
          .createIndex({ 'accessControl.get': 1 }, { background: true }, function(err) {
            test.equal(null, err);

            client.close();
            done();
          });
      });
    }
  });
});
