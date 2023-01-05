'use strict';
const { expect } = require('chai');
const { assert: test, setupDatabase } = require('./shared');
const shared = require('../tools/contexts');

describe('Indexes', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly execute createIndex', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 5 });
      // Create an index
      client
        .db(configuration.db)
        .createIndex('promiseCollectionCollections1', { a: 1 })
        .then(function (r) {
          test.ok(r != null);

          client.close(done);
        });
    }
  });

  it('Should correctly execute ensureIndex using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 5 });

      // Create an index
      client
        .db(configuration.db)
        .createIndex('promiseCollectionCollections2', { a: 1 })
        .then(function (r) {
          test.ok(r != null);

          client.close(done);
        });
    }
  });

  it('shouldCorrectlyExtractIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('test_index_information', function (err, collection) {
        collection.insertMany([{ a: 1 }], configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;

          // Create an index on the collection
          db.createIndex(
            collection.collectionName,
            'a',
            configuration.writeConcernMax(),
            function (err, indexName) {
              expect(err).to.not.exist;
              test.equal('a_1', indexName);

              // Let's fetch the index information
              db.indexInformation(collection.collectionName, function (err, collectionInfo) {
                expect(err).to.not.exist;
                test.ok(collectionInfo['_id_'] != null);
                test.equal('_id', collectionInfo['_id_'][0][0]);
                test.ok(collectionInfo['a_1'] != null);
                test.deepEqual([['a', 1]], collectionInfo['a_1']);

                db.indexInformation(collection.collectionName, function (err, collectionInfo2) {
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
                  client.close(done);
                });
              });
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyHandleMultipleColumnIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('test_multiple_index_cols', function (err, collection) {
        collection.insert({ a: 1 }, function (err) {
          expect(err).to.not.exist;
          // Create an index on the collection
          db.createIndex(
            collection.collectionName,
            [
              ['a', -1],
              ['b', 1],
              ['c', -1]
            ],
            configuration.writeConcernMax(),
            function (err, indexName) {
              expect(err).to.not.exist;
              test.equal('a_-1_b_1_c_-1', indexName);
              // Let's fetch the index information
              db.indexInformation(collection.collectionName, function (err, collectionInfo) {
                var count1 = Object.keys(collectionInfo).length;

                // Test
                test.equal(2, count1);
                test.ok(collectionInfo[indexName] != null);
                test.deepEqual(
                  [
                    ['a', -1],
                    ['b', 1],
                    ['c', -1]
                  ],
                  collectionInfo[indexName]
                );

                // Let's close the db
                client.close(done);
              });
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyHandleUniqueIndex', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // Create a non-unique index and test inserts
      db.createCollection('test_unique_index', function (err, collection) {
        db.createIndex(
          collection.collectionName,
          'hello',
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;
            // Insert some docs
            collection.insert(
              [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
              configuration.writeConcernMax(),
              function (err) {
                expect(err).to.not.exist;

                // Create a unique index and test that insert fails
                db.createCollection('test_unique_index2', function (err, collection) {
                  db.createIndex(
                    collection.collectionName,
                    'hello',
                    { unique: true, writeConcern: { w: 1 } },
                    function (err) {
                      expect(err).to.not.exist;
                      // Insert some docs
                      collection.insert(
                        [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
                        configuration.writeConcernMax(),
                        function (err) {
                          test.ok(err != null);
                          test.equal(11000, err.code);
                          client.close(done);
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
    }
  });

  it('shouldCorrectlyCreateSubfieldIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // Create a non-unique index and test inserts
      db.createCollection('test_index_on_subfield', function (err, collection) {
        collection.insert(
          [{ hello: { a: 4, b: 5 } }, { hello: { a: 7, b: 2 } }, { hello: { a: 4, b: 10 } }],
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;

            // Create a unique subfield index and test that insert fails
            db.createCollection('test_index_on_subfield2', function (err, collection) {
              db.createIndex(
                collection.collectionName,
                'hello_a',
                { writeConcern: { w: 1 }, unique: true },
                function (err) {
                  expect(err).to.not.exist;

                  collection.insert(
                    [
                      { hello: { a: 4, b: 5 } },
                      { hello: { a: 7, b: 2 } },
                      { hello: { a: 4, b: 10 } }
                    ],
                    configuration.writeConcernMax(),
                    function (err) {
                      // Assert that we have erros
                      test.ok(err != null);
                      client.close(done);
                    }
                  );
                }
              );
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyDropIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('test_drop_indexes', function (err, collection) {
        collection.insert({ a: 1 }, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;
          // Create an index on the collection
          db.createIndex(
            collection.collectionName,
            'a',
            configuration.writeConcernMax(),
            function (err, indexName) {
              test.equal('a_1', indexName);
              // Drop all the indexes
              collection.dropIndexes(function (err, result) {
                test.equal(true, result);

                collection.indexInformation(function (err, result) {
                  test.ok(result['a_1'] == null);
                  client.close(done);
                });
              });
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyHandleDistinctIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('test_distinct_queries', function (err, collection) {
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
          function (err) {
            expect(err).to.not.exist;
            collection.distinct('a', function (err, docs) {
              test.deepEqual([0, 1, 2, 3], docs.sort());

              collection.distinct('b.c', function (err, docs) {
                test.deepEqual(['a', 'b', 'c'], docs.sort());
                client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyExecuteEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('test_ensure_index', function (err, collection) {
        expect(err).to.not.exist;
        // Create an index on the collection
        db.createIndex(
          collection.collectionName,
          'a',
          configuration.writeConcernMax(),
          function (err, indexName) {
            expect(err).to.not.exist;
            test.equal('a_1', indexName);
            // Let's fetch the index information
            db.indexInformation(collection.collectionName, function (err, collectionInfo) {
              test.ok(collectionInfo['_id_'] != null);
              test.equal('_id', collectionInfo['_id_'][0][0]);
              test.ok(collectionInfo['a_1'] != null);
              test.deepEqual([['a', 1]], collectionInfo['a_1']);

              db.createIndex(
                collection.collectionName,
                'a',
                configuration.writeConcernMax(),
                function (err, indexName) {
                  test.equal('a_1', indexName);
                  // Let's fetch the index information
                  db.indexInformation(collection.collectionName, function (err, collectionInfo) {
                    test.ok(collectionInfo['_id_'] != null);
                    test.equal('_id', collectionInfo['_id_'][0][0]);
                    test.ok(collectionInfo['a_1'] != null);
                    test.deepEqual([['a', 1]], collectionInfo['a_1']);
                    // Let's close the db
                    client.close(done);
                  });
                }
              );
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyCreateAndUseSparseIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('create_and_use_sparse_index_test', function (err) {
        expect(err).to.not.exist;
        const collection = db.collection('create_and_use_sparse_index_test');
        collection.createIndex(
          { title: 1 },
          { sparse: true, writeConcern: { w: 1 } },
          function (err) {
            expect(err).to.not.exist;
            collection.insert(
              [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
              configuration.writeConcernMax(),
              function (err) {
                expect(err).to.not.exist;
                collection
                  .find({ title: { $ne: null } })
                  .sort({ title: 1 })
                  .toArray(function (err, items) {
                    test.equal(1, items.length);
                    test.equal('Sarah', items[0].name);

                    // Fetch the info for the indexes
                    collection.indexInformation({ full: true }, function (err, indexInfo) {
                      expect(err).to.not.exist;
                      test.equal(2, indexInfo.length);
                      client.close(done);
                    });
                  });
              }
            );
          }
        );
      });
    }
  });

  it('shouldCorrectlyHandleGeospatialIndexes', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.6.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('geospatial_index_test', function (err) {
        expect(err).to.not.exist;
        const collection = db.collection('geospatial_index_test');
        collection.createIndex({ loc: '2d' }, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;
          collection.insert({ loc: [-100, 100] }, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            collection.insert({ loc: [200, 200] }, configuration.writeConcernMax(), function (err) {
              test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
              test.ok(err.errmsg.indexOf('-180') !== -1);
              test.ok(err.errmsg.indexOf('180') !== -1);
              client.close(done);
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyHandleGeospatialIndexesAlteredRange', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.6.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection('geospatial_index_altered_test', function (err) {
        expect(err).to.not.exist;
        const collection = db.collection('geospatial_index_altered_test');
        collection.createIndex(
          { loc: '2d' },
          { min: 0, max: 1024, writeConcern: { w: 1 } },
          function (err) {
            expect(err).to.not.exist;
            collection.insert({ loc: [100, 100] }, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;
              collection.insert(
                { loc: [200, 200] },
                configuration.writeConcernMax(),
                function (err) {
                  expect(err).to.not.exist;
                  collection.insert(
                    { loc: [-200, -200] },
                    configuration.writeConcernMax(),
                    function (err) {
                      test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
                      test.ok(err.errmsg.indexOf('0') !== -1);
                      test.ok(err.errmsg.indexOf('1024') !== -1);
                      client.close(done);
                    }
                  );
                }
              );
            });
          }
        );
      });
    }
  });

  it('shouldThrowDuplicateKeyErrorWhenCreatingIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection(
        'shouldThrowDuplicateKeyErrorWhenCreatingIndex',
        function (err, collection) {
          collection.insert([{ a: 1 }, { a: 1 }], configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            collection.createIndex(
              { a: 1 },
              { unique: true, writeConcern: { w: 1 } },
              function (err) {
                test.ok(err != null);
                client.close(done);
              }
            );
          });
        }
      );
    }
  });

  it('shouldThrowDuplicateKeyErrorWhenDriverInStrictMode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.createCollection(
        'shouldThrowDuplicateKeyErrorWhenDriverInStrictMode',
        function (err, collection) {
          collection.insert([{ a: 1 }, { a: 1 }], configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            collection.createIndex(
              { a: 1 },
              { unique: true, writeConcern: { w: 1 } },
              function (err) {
                test.ok(err != null);
                client.close(done);
              }
            );
          });
        }
      );
    }
  });

  it('shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // Establish connection to db
      db.createCollection(
        'shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex',
        function (err, collection) {
          expect(err).to.not.exist;

          collection.createIndex(
            { loc: '2d' },
            { min: 200, max: 1400, writeConcern: { w: 1 } },
            function (err) {
              expect(err).to.not.exist;

              collection.insert(
                { loc: [600, 600] },
                configuration.writeConcernMax(),
                function (err) {
                  expect(err).to.not.exist;
                  client.close(done);
                }
              );
            }
          );
        }
      );
    }
  });

  it('Should correctly create an index with overriden name', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // Establish connection to db
      db.createCollection(
        'shouldCorrectlyCreateAnIndexWithOverridenName',
        function (err, collection) {
          expect(err).to.not.exist;

          collection.createIndex('name', { name: 'myfunky_name' }, function (err) {
            expect(err).to.not.exist;

            // Fetch full index information
            collection.indexInformation({ full: false }, function (err, indexInformation) {
              test.ok(indexInformation['myfunky_name'] != null);
              client.close(done);
            });
          });
        }
      );
    }
  });

  it('should handle index declarations using objects from other contexts', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);

      db.collection('indexcontext').createIndex(
        shared.object,
        { background: true },
        function (err) {
          expect(err).to.not.exist;
          db.collection('indexcontext').createIndex(
            shared.array,
            { background: true },
            function (err) {
              expect(err).to.not.exist;
              client.close(done);
            }
          );
        }
      );
    }
  });

  it('should correctly return error message when applying unique index to duplicate documents', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('should_throw_error_due_to_duplicates');
      collection.insert(
        [{ a: 1 }, { a: 1 }, { a: 1 }],
        configuration.writeConcernMax(),
        function (err) {
          expect(err).to.not.exist;

          collection.createIndex(
            { a: 1 },
            { writeConcern: { w: 1 }, unique: true },
            function (err) {
              test.ok(err != null);
              client.close(done);
            }
          );
        }
      );
    }
  });

  it('should correctly drop index with no callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('should_correctly_drop_index');
      collection.insert([{ a: 1 }], configuration.writeConcernMax(), function (err) {
        expect(err).to.not.exist;

        collection.createIndex({ a: 1 }, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;
          collection
            .dropIndex('a_1')
            .then(() => {
              client.close(done);
            })
            .catch(err => {
              client.close();
              done(err);
            });
        });
      });
    }
  });

  it('should correctly apply hint to find', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('should_correctly_apply_hint');
      collection.insert([{ a: 1 }], configuration.writeConcernMax(), function (err) {
        expect(err).to.not.exist;

        collection.createIndex({ a: 1 }, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;

          collection.indexInformation({ full: false }, function (err) {
            expect(err).to.not.exist;

            collection.find({}, { hint: 'a_1' }).toArray(function (err, docs) {
              expect(err).to.not.exist;
              test.equal(1, docs[0].a);
              client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('should_correctly_set_language_override');
      collection.insert(
        [{ text: 'Lorem ipsum dolor sit amet.', langua: 'italian' }],
        function (err) {
          expect(err).to.not.exist;

          collection.createIndex(
            { text: 'text' },
            { language_override: 'langua', name: 'language_override_index' },
            function (err) {
              expect(err).to.not.exist;

              collection.indexInformation({ full: true }, function (err, indexInformation) {
                expect(err).to.not.exist;
                for (var i = 0; i < indexInformation.length; i++) {
                  if (indexInformation[i].name === 'language_override_index')
                    test.equal(indexInformation[i].language_override, 'langua');
                }

                client.close(done);
              });
            }
          );
        }
      );
    }
  });

  it('should correctly use listIndexes to retrieve index list', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('testListIndexes').createIndex({ a: 1 }, function (err) {
        expect(err).to.not.exist;

        // Get the list of indexes
        db.collection('testListIndexes')
          .listIndexes()
          .toArray(function (err, indexes) {
            expect(err).to.not.exist;
            test.equal(2, indexes.length);

            client.close(done);
          });
      });
    }
  });

  it('should correctly use listIndexes to retrieve index list using hasNext', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('testListIndexes_2').createIndex({ a: 1 }, function (err) {
        expect(err).to.not.exist;

        // Get the list of indexes
        db.collection('testListIndexes_2')
          .listIndexes()
          .hasNext(function (err, result) {
            expect(err).to.not.exist;
            test.equal(true, result);

            client.close(done);
          });
      });
    }
  });

  it('should correctly ensureIndex for nested style index name c.d', {
    metadata: {
      requires: { mongodb: '>=2.4.0', topology: ['single', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('ensureIndexWithNestedStyleIndex').createIndex({ 'c.d': 1 }, function (err) {
        expect(err).to.not.exist;

        // Get the list of indexes
        db.collection('ensureIndexWithNestedStyleIndex')
          .listIndexes()
          .toArray(function (err, indexes) {
            expect(err).to.not.exist;
            test.equal(2, indexes.length);

            client.close(done);
          });
      });
    }
  });

  it('should correctly execute createIndexes with multiple indexes', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('createIndexes').createIndexes(
        [{ key: { a: 1 } }, { key: { b: 1 }, name: 'hello1' }],
        function (err, r) {
          expect(err).to.not.exist;
          expect(r).to.deep.equal(['a_1', 'hello1']);

          db.collection('createIndexes')
            .listIndexes()
            .toArray(function (err, docs) {
              expect(err).to.not.exist;
              var keys = {};

              for (var i = 0; i < docs.length; i++) {
                keys[docs[i].name] = true;
              }

              test.ok(keys['a_1']);
              test.ok(keys['hello1']);

              client.close(done);
            });
        }
      );
    }
  });

  it('should correctly execute createIndexes with one index', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('createIndexes').createIndexes([{ key: { a: 1 } }], function (err, r) {
        expect(err).to.not.exist;
        expect(r).to.deep.equal(['a_1']);

        db.collection('createIndexes')
          .listIndexes()
          .toArray(function (err, docs) {
            expect(err).to.not.exist;
            var keys = {};

            for (var i = 0; i < docs.length; i++) {
              keys[docs[i].name] = true;
            }

            test.ok(keys['a_1']);
            test.ok(keys['hello1']);

            client.close(done);
          });
      });
    }
  });

  it('shouldCorrectlyCreateTextIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      db.collection('text_index').createIndex(
        { '$**': 'text' },
        { name: 'TextIndex' },
        function (err, r) {
          expect(err).to.not.exist;
          test.equal('TextIndex', r);
          // Let's close the db
          client.close(done);
        }
      );
    }
  });

  it('should correctly pass partialIndexes through to createIndexCommand', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.1.8'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var started = [];
      var succeeded = [];
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });

      client.on('commandStarted', function (event) {
        if (event.commandName === 'createIndexes') started.push(event);
      });

      client.on('commandSucceeded', function (event) {
        if (event.commandName === 'createIndexes') succeeded.push(event);
      });

      var db = client.db(configuration.db);

      db.collection('partialIndexes').createIndex(
        { a: 1 },
        { partialFilterExpression: { a: 1 } },
        function (err) {
          expect(err).to.not.exist;
          test.deepEqual({ a: 1 }, started[0].command.indexes[0].partialFilterExpression);
          client.close(done);
        }
      );
    }
  });

  it('should not retry partial index expression error', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>=3.1.8'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // Can't use $exists: false in partial filter expression, see
      // https://jira.mongodb.org/browse/SERVER-17853
      var opts = { partialFilterExpression: { a: { $exists: false } } };
      db.collection('partialIndexes').createIndex({ a: 1 }, opts, function (err) {
        test.ok(err);
        test.equal(err.code, 67);
        var msg = "key $exists must not start with '$'";
        test.ok(err.toString().indexOf(msg) === -1);

        client.close(done);
      });
    }
  });

  it('should correctly create index on embedded key', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
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
        function (err) {
          expect(err).to.not.exist;

          collection.createIndex({ 'a.a': 1 }, function (err) {
            expect(err).to.not.exist;
            client.close(done);
          });
        }
      );
    }
  });

  it('should correctly create index using . keys', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('embedded_key_indes_1');
      collection.createIndex(
        { 'key.external_id': 1, 'key.type': 1 },
        { unique: true, sparse: true, name: 'indexname' },
        function (err) {
          expect(err).to.not.exist;

          client.close(done);
        }
      );
    }
  });

  it('error on duplicate key index', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
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
        function (err) {
          expect(err).to.not.exist;
          collection.createIndex(
            { 'key.external_id': 1, 'key.type': 1 },
            { unique: true, sparse: true, name: 'indexname' },
            function (err) {
              test.equal(11000, err.code);

              client.close(done);
            }
          );
        }
      );
    }
  });

  it('should correctly create Index with sub element', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // insert a doc
      db.collection('messed_up_index').createIndex(
        { temporary: 1, 'store.addressLines': 1, lifecycleStatus: 1 },
        configuration.writeConcernMax(),
        function (err) {
          expect(err).to.not.exist;

          client.close(done);
        }
      );
    }
  });

  it('should correctly fail detect error code 85 when performing createIndex', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.0.0 <=4.8.0'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('messed_up_options');

      collection.createIndex(
        { 'a.one': 1, 'a.two': 1 },
        { name: 'n1', sparse: false },
        function (err) {
          expect(err).to.not.exist;

          collection.createIndex(
            { 'a.one': 1, 'a.two': 1 },
            { name: 'n2', sparse: true },
            function (err) {
              test.ok(err);
              test.equal(85, err.code);

              client.close(done);
            }
          );
        }
      );
    }
  });

  it('should correctly fail by detecting error code 86 when performing createIndex', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.0.0'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('messed_up_options');

      collection.createIndex({ 'b.one': 1, 'b.two': 1 }, { name: 'test' }, function (err) {
        expect(err).to.not.exist;

        collection.createIndex({ 'b.one': -1, 'b.two': -1 }, { name: 'test' }, function (err) {
          test.ok(err);
          test.equal(86, err.code);

          client.close(done);
        });
      });
    }
  });

  it('should correctly create Index with sub element running in background', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      // insert a doc
      db.collection('messed_up_index_2').createIndex(
        { 'accessControl.get': 1 },
        { background: true },
        function (err) {
          expect(err).to.not.exist;

          client.close(done);
        }
      );
    }
  });

  context('commitQuorum', function () {
    let client;
    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
    });

    afterEach(async function () {
      await client.close();
    });

    function throwErrorTest(testCommand) {
      return {
        metadata: { requires: { mongodb: '<4.4' } },
        test: function (done) {
          const db = client.db('test');
          const collection = db.collection('commitQuorum');
          testCommand(db, collection, (err, result) => {
            expect(err).to.exist;
            expect(err.message).to.equal(
              'Option `commitQuorum` for `createIndexes` not supported on servers < 4.4'
            );
            expect(result).to.not.exist;
            done();
          });
        }
      };
    }
    it(
      'should throw an error if commitQuorum specified on db.createIndex',
      throwErrorTest((db, collection, cb) =>
        db.createIndex(collection.collectionName, 'a', { commitQuorum: 'all' }, cb)
      )
    );
    it(
      'should throw an error if commitQuorum specified on collection.createIndex',
      throwErrorTest((db, collection, cb) =>
        collection.createIndex('a', { commitQuorum: 'all' }, cb)
      )
    );
    it(
      'should throw an error if commitQuorum specified on collection.createIndexes',
      throwErrorTest((db, collection, cb) =>
        collection.createIndexes(
          [{ key: { a: 1 } }, { key: { b: 1 } }],
          { commitQuorum: 'all' },
          cb
        )
      )
    );

    function commitQuorumTest(testCommand) {
      return {
        metadata: { requires: { mongodb: '>=4.4', topology: ['replicaset', 'sharded'] } },
        test: function (done) {
          const events = [];
          client.on('commandStarted', event => {
            if (event.commandName === 'createIndexes') events.push(event);
          });

          const db = client.db('test');
          const collection = db.collection('commitQuorum');
          collection.insertOne({ a: 1 }, function (err) {
            expect(err).to.not.exist;
            testCommand(db, collection, err => {
              expect(err).to.not.exist;

              expect(events).to.be.an('array').with.lengthOf(1);
              expect(events[0]).nested.property('command.commitQuorum').to.equal(0);
              collection.drop(err => {
                expect(err).to.not.exist;
                done();
              });
            });
          });
        }
      };
    }
    it(
      'should run command with commitQuorum if specified on db.createIndex',
      commitQuorumTest((db, collection, cb) =>
        db.createIndex(
          collection.collectionName,
          'a',
          { writeConcern: { w: 'majority' }, commitQuorum: 0 },
          cb
        )
      )
    );
    it(
      'should run command with commitQuorum if specified on collection.createIndex',
      commitQuorumTest((db, collection, cb) =>
        collection.createIndex('a', { writeConcern: { w: 'majority' }, commitQuorum: 0 }, cb)
      )
    );
    it(
      'should run command with commitQuorum if specified on collection.createIndexes',
      commitQuorumTest((db, collection, cb) =>
        collection.createIndexes(
          [{ key: { a: 1 } }],
          { writeConcern: { w: 'majority' }, commitQuorum: 0 },
          cb
        )
      )
    );
  });

  it('should create index hidden', {
    metadata: { requires: { mongodb: '>=4.4', topology: 'single' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      const db = client.db(configuration.db);
      db.createCollection('hidden_index_collection', (err, collection) => {
        expect(err).to.not.exist;
        collection.createIndex('a', { hidden: true }, (err, index) => {
          expect(err).to.not.exist;
          expect(index).to.equal('a_1');
          collection.listIndexes().toArray((err, indexes) => {
            expect(err).to.not.exist;
            expect(indexes).to.deep.equal([
              { v: 2, key: { _id: 1 }, name: '_id_' },
              { v: 2, key: { a: 1 }, name: 'a_1', hidden: true }
            ]);
            client.close(done);
          });
        });
      });
    }
  });
});
