'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('Find', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * Test a simple find
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleFind', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('test_find_simple', function(err, collection) {
          var doc1 = null;

          // Insert some test documents
          collection.insert([{ a: 2 }, { b: 3 }], configuration.writeConcernMax(), function(
            err,
            r
          ) {
            doc1 = r.ops[0];

            // Ensure correct insertion testing via the cursor and the count function
            collection.find().toArray(function(err, documents) {
              test.equal(2, documents.length);

              collection.count(function(err, count) {
                test.equal(2, count);

                // Fetch values by selection
                collection.find({ a: doc1.a }).toArray(function(err, documents) {
                  test.equal(1, documents.length);
                  test.equal(doc1.a, documents[0].a);
                  // Let's close the db
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
   * Test a simple find chained
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleChainedFind', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_simple_chained', function(err) {
          test.equal(null, err);
          db.collection('test_find_simple_chained', function(err, collection) {
            var doc1 = null;

            // Insert some test documents
            collection.insert([{ a: 2 }, { b: 3 }], configuration.writeConcernMax(), function(
              err,
              r
            ) {
              doc1 = r.ops[0];

              // Ensure correct insertion testing via the cursor and the count function
              collection.find().toArray(function(err, documents) {
                test.equal(2, documents.length);

                collection.count(function(err, count) {
                  test.equal(2, count);

                  // Fetch values by selection
                  collection.find({ a: doc1.a }).toArray(function(err, documents) {
                    test.equal(1, documents.length);
                    test.equal(doc1.a, documents[0].a);
                    // Let's close the db
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

  /**
   * Test advanced find
   * @ignore
   */
  it('shouldCorrectlyPerformAdvancedFinds', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_find_advanced');

        // Insert some test documents
        collection.insert([{ a: 1 }, { a: 2 }, { b: 3 }], configuration.writeConcernMax(), function(
          err,
          r
        ) {
          var doc1 = r.ops[0],
            doc2 = r.ops[1];

          // Locate by less than
          collection.find({ a: { $lt: 10 } }).toArray(function(err, documents) {
            test.equal(2, documents.length);
            // Check that the correct documents are returned
            var results = [];
            // Check that we have all the results we want
            documents.forEach(function(doc) {
              if (doc.a === 1 || doc.a === 2) results.push(1);
            });
            test.equal(2, results.length);

            // Locate by greater than
            collection.find({ a: { $gt: 1 } }).toArray(function(err, documents) {
              test.equal(1, documents.length);
              test.equal(2, documents[0].a);

              // Locate by less than or equal to
              collection.find({ a: { $lte: 1 } }).toArray(function(err, documents) {
                test.equal(1, documents.length);
                test.equal(1, documents[0].a);

                // Locate by greater than or equal to
                collection.find({ a: { $gte: 1 } }).toArray(function(err, documents) {
                  test.equal(2, documents.length);
                  // Check that the correct documents are returned
                  var results = [];
                  // Check that we have all the results we want
                  documents.forEach(function(doc) {
                    if (doc.a === 1 || doc.a === 2) results.push(1);
                  });
                  test.equal(2, results.length);

                  // Locate by between
                  collection.find({ a: { $gt: 1, $lt: 3 } }).toArray(function(err, documents) {
                    test.equal(1, documents.length);
                    test.equal(2, documents[0].a);

                    // Locate in clause
                    collection.find({ a: { $in: [1, 2] } }).toArray(function(err, documents) {
                      test.equal(2, documents.length);
                      // Check that the correct documents are returned
                      var results = [];
                      // Check that we have all the results we want
                      documents.forEach(function(doc) {
                        if (doc.a === 1 || doc.a === 2) results.push(1);
                      });
                      test.equal(2, results.length);

                      // Locate in _id clause
                      collection
                        .find({ _id: { $in: [doc1['_id'], doc2['_id']] } })
                        .toArray(function(err, documents) {
                          test.equal(2, documents.length);
                          // Check that the correct documents are returned
                          var results = [];
                          // Check that we have all the results we want
                          documents.forEach(function(doc) {
                            if (doc.a === 1 || doc.a === 2) results.push(1);
                          });
                          test.equal(2, results.length);
                          // Let's close the db
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
   * Test sorting of results
   * @ignore
   */
  it('shouldCorrectlyPerformFindWithSort', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_sorting', function(err) {
          test.equal(null, err);

          db.collection('test_find_sorting', function(err, collection) {
            // Insert some test documents
            collection.insert(
              [{ a: 1, b: 2 }, { a: 2, b: 1 }, { a: 3, b: 2 }, { a: 4, b: 1 }],
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                // Test sorting (ascending)
                collection
                  .find({ a: { $lt: 10 } }, { sort: [['a', 1]] })
                  .toArray(function(err, documents) {
                    test.equal(4, documents.length);
                    test.equal(1, documents[0].a);
                    test.equal(2, documents[1].a);
                    test.equal(3, documents[2].a);
                    test.equal(4, documents[3].a);

                    // Test sorting (descending)
                    collection
                      .find({ a: { $lt: 10 } }, { sort: [['a', -1]] })
                      .toArray(function(err, documents) {
                        test.equal(4, documents.length);
                        test.equal(4, documents[0].a);
                        test.equal(3, documents[1].a);
                        test.equal(2, documents[2].a);
                        test.equal(1, documents[3].a);

                        // Test sorting (descending), sort is hash
                        collection
                          .find({ a: { $lt: 10 } }, { sort: { a: -1 } })
                          .toArray(function(err, documents) {
                            test.equal(4, documents.length);
                            test.equal(4, documents[0].a);
                            test.equal(3, documents[1].a);
                            test.equal(2, documents[2].a);
                            test.equal(1, documents[3].a);

                            // Sorting using array of names, assumes ascending order
                            collection
                              .find({ a: { $lt: 10 } }, { sort: ['a'] })
                              .toArray(function(err, documents) {
                                test.equal(4, documents.length);
                                test.equal(1, documents[0].a);
                                test.equal(2, documents[1].a);
                                test.equal(3, documents[2].a);
                                test.equal(4, documents[3].a);

                                // Sorting using single name, assumes ascending order
                                collection
                                  .find({ a: { $lt: 10 } }, { sort: 'a' })
                                  .toArray(function(err, documents) {
                                    test.equal(4, documents.length);
                                    test.equal(1, documents[0].a);
                                    test.equal(2, documents[1].a);
                                    test.equal(3, documents[2].a);
                                    test.equal(4, documents[3].a);

                                    // Sorting using single name, assumes ascending order, sort is hash
                                    collection
                                      .find({ a: { $lt: 10 } }, { sort: { a: 1 } })
                                      .toArray(function(err, documents) {
                                        test.equal(4, documents.length);
                                        test.equal(1, documents[0].a);
                                        test.equal(2, documents[1].a);
                                        test.equal(3, documents[2].a);
                                        test.equal(4, documents[3].a);

                                        collection
                                          .find({ a: { $lt: 10 } }, { sort: ['b', 'a'] })
                                          .toArray(function(err, documents) {
                                            test.equal(4, documents.length);
                                            test.equal(2, documents[0].a);
                                            test.equal(4, documents[1].a);
                                            test.equal(1, documents[2].a);
                                            test.equal(3, documents[3].a);

                                            // Sorting using empty array, no order guarantee should not blow up
                                            collection
                                              .find({ a: { $lt: 10 } }, { sort: [] })
                                              .toArray(function(err, documents) {
                                                test.equal(4, documents.length);

                                                /* NONACTUAL */
                                                // Sorting using ordered hash
                                                collection
                                                  .find({ a: { $lt: 10 } }, { sort: { a: -1 } })
                                                  .toArray(function(err, documents) {
                                                    // Fail test if not an error
                                                    test.equal(4, documents.length);
                                                    // Let's close the db
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
            );
          });
        });
      });
    }
  });

  /**
   * Test the limit function of the db
   * @ignore
   */
  it('shouldCorrectlyPerformFindWithLimit', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_limits', function(err) {
          test.equal(null, err);

          db.collection('test_find_limits', function(err, collection) {
            // Insert some test documents
            collection.insert(
              [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }],
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                // Test limits
                collection.find({}, { limit: 1 }).toArray(function(err, documents) {
                  test.equal(1, documents.length);

                  collection.find({}, { limit: 2 }).toArray(function(err, documents) {
                    test.equal(2, documents.length);

                    collection.find({}, { limit: 3 }).toArray(function(err, documents) {
                      test.equal(3, documents.length);

                      collection.find({}, { limit: 4 }).toArray(function(err, documents) {
                        test.equal(4, documents.length);

                        collection.find({}, {}).toArray(function(err, documents) {
                          test.equal(4, documents.length);

                          collection.find({}, { limit: 99 }).toArray(function(err, documents) {
                            test.equal(4, documents.length);
                            // Let's close the db
                            client.close();
                            done();
                          });
                        });
                      });
                    });
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
   * Test find by non-quoted values (issue #128)
   * @ignore
   */
  it('shouldCorrectlyFindWithNonQuotedValues', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_non_quoted_values', function(err) {
          test.equal(null, err);

          db.collection('test_find_non_quoted_values', function(err, collection) {
            // insert test document
            collection.insert(
              [{ a: 19, b: 'teststring', c: 59920303 }, { a: '19', b: 'teststring', c: 3984929 }],
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);
                collection.find({ a: 19 }).toArray(function(err, documents) {
                  test.equal(1, documents.length);
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
   * Test for querying embedded document using dot-notation (issue #126)
   * @ignore
   */
  it('shouldCorrectlyFindEmbeddedDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_embedded_document', function(err) {
          test.equal(null, err);

          db.collection('test_find_embedded_document', function(err, collection) {
            // insert test document
            collection.insert(
              [
                { a: { id: 10, value: 'foo' }, b: 'bar', c: { id: 20, value: 'foobar' } },
                { a: { id: 11, value: 'foo' }, b: 'bar2', c: { id: 20, value: 'foobar' } }
              ],
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                // test using integer value
                collection.find({ 'a.id': 10 }).toArray(function(err, documents) {
                  test.equal(1, documents.length);
                  test.equal('bar', documents[0].b);

                  // test using string value
                  collection.find({ 'a.value': 'foo' }).toArray(function(err, documents) {
                    // should yield 2 documents
                    test.equal(2, documents.length);
                    test.equal('bar', documents[0].b);
                    test.equal('bar2', documents[1].b);
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
   * Find no records
   * @ignore
   */
  it('shouldCorrectlyFindNoRecords', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_one_no_records', function(err) {
          test.equal(null, err);
          db.collection('test_find_one_no_records', function(err, collection) {
            test.equal(null, err);
            collection.find({ a: 1 }, {}).toArray(function(err, documents) {
              test.equal(0, documents.length);
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
   */
  it('shouldCorrectlyPerformFindByWhere', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Code = configuration.require.Code;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_where', function(err, collection) {
          collection.insert(
            [{ a: 1 }, { a: 2 }, { a: 3 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              collection.count(function(err, count) {
                test.equal(null, err);
                test.equal(3, count);

                // Let's test usage of the $where statement
                collection.find({ $where: new Code('this.a > 2') }).count(function(err, count) {
                  test.equal(null, err);
                  test.equal(1, count);

                  collection
                    .find({ $where: new Code('this.a > i', { i: 1 }) })
                    .count(function(err, count) {
                      test.equal(null, err);
                      test.equal(2, count);

                      // Let's close the db
                      client.close();
                      done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformFindsWithHintTurnedOn', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_hint', function(err, collection) {
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            db.createIndex(
              collection.collectionName,
              'a',
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);
                collection.find({ a: 1 }, { hint: 'a' }).toArray(function(err) {
                  test.ok(err != null);

                  collection.find({ a: 1 }, { hint: ['a'] }).toArray(function(err, items) {
                    test.equal(1, items.length);

                    collection.find({ a: 1 }, { hint: { a: 1 } }).toArray(function(err, items) {
                      test.equal(1, items.length);

                      // Modify hints
                      collection.hint = 'a_1';
                      test.equal('a_1', collection.hint);
                      collection.find({ a: 1 }).toArray(function(err, items) {
                        test.equal(1, items.length);

                        collection.hint = ['a'];
                        test.equal(1, collection.hint['a']);
                        collection.find({ a: 1 }).toArray(function(err, items) {
                          test.equal(1, items.length);

                          collection.hint = { a: 1 };
                          test.equal(1, collection.hint['a']);
                          collection.find({ a: 1 }).toArray(function(err, items) {
                            test.equal(1, items.length);

                            collection.hint = null;
                            test.ok(collection.hint == null);
                            collection.find({ a: 1 }).toArray(function(err, items) {
                              test.equal(1, items.length);
                              // Let's close the db
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
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformFindByObjectID', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_by_oid', function(err, collection) {
          collection.save({ hello: 'mike' }, configuration.writeConcernMax(), function(err, r) {
            var docs = r.ops[0];
            test.ok(
              docs._id instanceof ObjectID ||
                Object.prototype.toString.call(docs._id) === '[object ObjectID]'
            );

            collection.findOne({ _id: docs._id }, function(err, doc) {
              test.equal('mike', doc.hello);

              var id = doc._id.toString();
              collection.findOne({ _id: new ObjectID(id) }, function(err, doc) {
                test.equal('mike', doc.hello);
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
   */
  it('shouldCorrectlyReturnDocumentWithOriginalStructure', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_by_oid_with_subdocs', function(err, collection) {
          var c1 = { _id: new ObjectID(), comments: [], title: 'number 1' };
          var c2 = { _id: new ObjectID(), comments: [], title: 'number 2' };
          var doc = {
            numbers: [],
            owners: [],
            comments: [c1, c2],
            _id: new ObjectID()
          };

          collection.insert(doc, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            collection.findOne({ _id: doc._id }, { w: 1, fields: undefined }, function(err, doc) {
              expect(err).to.not.exist;
              test.equal(2, doc.comments.length);
              test.equal('number 1', doc.comments[0].title);
              test.equal('number 2', doc.comments[1].title);

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
  it('shouldCorrectlyRetrieveSingleRecord', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db.createCollection('test_should_correctly_retrieve_one_record', function(err, collection) {
          collection.insert({ a: 0 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            db.collection('test_should_correctly_retrieve_one_record', function(
              err,
              usercollection
            ) {
              usercollection.findOne({ a: 0 }, function(err) {
                test.equal(null, err);
                p_client.close();

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
  it('shouldCorrectlyHandleError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_one_error_handling', function(err, collection) {
          // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
          // is the error handling of the findOne Method
          try {
            collection.findOne(
              { _id: ObjectID.createFromHexString('5e9bd59248305adf18ebc15703a1') },
              function() {}
            );
          } catch (err) {
            client.close();
            done();
          }
        });
      });
    }
  });

  /**
   * Test field select with options
   * @ignore
   */
  it('shouldCorrectlyPerformFindWithOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_field_select_with_options', function(err) {
          test.equal(null, err);
          db.collection('test_field_select_with_options', function(err, collection) {
            var docCount = 25,
              docs = [];

            // Insert some test documents
            while (docCount--) docs.push({ a: docCount, b: docCount });
            collection.insert(docs, configuration.writeConcernMax(), function(err, retDocs) {
              docs = retDocs;

              collection
                .find({}, { limit: 3, sort: [['a', -1]], projection: { a: 1 } })
                .toArray(function(err, documents) {
                  test.equal(3, documents.length);

                  documents.forEach(function(doc, idx) {
                    test.equal(undefined, doc.b); // making sure field select works
                    test.equal(24 - idx, doc.a); // checking limit sort object with field select
                  });

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
   * Test findAndModify a document
   * @ignore
   */
  it('shouldCorrectlyFindAndModifyDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_and_modify_a_document_1', function(err, collection) {
          // Test return new document on change
          collection.insert({ a: 1, b: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Let's modify the document in place
            collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b: 3 } },
              { new: true },
              function(err, updated_doc) {
                test.equal(1, updated_doc.value.a);
                test.equal(3, updated_doc.value.b);

                // Test return old document on change
                collection.insert({ a: 2, b: 2 }, configuration.writeConcernMax(), function(err) {
                  test.equal(null, err);

                  // Let's modify the document in place
                  collection.findAndModify(
                    { a: 2 },
                    [['a', 1]],
                    { $set: { b: 3 } },
                    configuration.writeConcernMax(),
                    function(err, result) {
                      test.equal(2, result.value.a);
                      test.equal(2, result.value.b);

                      // Test remove object on change
                      collection.insert({ a: 3, b: 2 }, configuration.writeConcernMax(), function(
                        err
                      ) {
                        test.equal(null, err);
                        // Let's modify the document in place
                        collection.findAndModify(
                          { a: 3 },
                          [],
                          { $set: { b: 3 } },
                          { remove: true },
                          function(err, updated_doc) {
                            test.equal(3, updated_doc.value.a);
                            test.equal(2, updated_doc.value.b);

                            // Let's upsert!
                            collection.findAndModify(
                              { a: 4 },
                              [],
                              { $set: { b: 3 } },
                              { new: true, upsert: true },
                              function(err, updated_doc) {
                                test.equal(4, updated_doc.value.a);
                                test.equal(3, updated_doc.value.b);

                                // Test selecting a subset of fields
                                collection.insert(
                                  { a: 100, b: 101 },
                                  configuration.writeConcernMax(),
                                  function(err, r) {
                                    test.equal(null, err);

                                    collection.findAndModify(
                                      { a: 100 },
                                      [],
                                      { $set: { b: 5 } },
                                      { new: true, fields: { b: 1 } },
                                      function(err, updated_doc) {
                                        test.equal(2, Object.keys(updated_doc.value).length);
                                        test.equal(
                                          r.ops[0]['_id'].toHexString(),
                                          updated_doc.value._id.toHexString()
                                        );
                                        test.equal(5, updated_doc.value.b);
                                        test.equal('undefined', typeof updated_doc.value.a);
                                        client.close();
                                        done();
                                      }
                                    );
                                  }
                                );
                              }
                            );
                          }
                        );
                      });
                    }
                  );
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * Test findAndModify a document with fields
   * @ignore
   */
  it('shouldCorrectlyFindAndModifyDocumentAndReturnSelectedFieldsOnly', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_and_modify_a_document_2', function(err, collection) {
          // Test return new document on change
          collection.insert({ a: 1, b: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Let's modify the document in place
            collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b: 3 } },
              { new: true, fields: { a: 1 } },
              function(err, updated_doc) {
                test.equal(2, Object.keys(updated_doc.value).length);
                test.equal(1, updated_doc.value.a);
                client.close();
                done();
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
  it('ShouldCorrectlyLocatePostAndIncValues', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag', function(
          err,
          collection
        ) {
          // Test return new document on change
          collection.insert(
            {
              title: 'Tobi',
              author: 'Brian',
              newTitle: 'Woot',
              meta: { visitors: 0 }
            },
            configuration.writeConcernMax(),
            function(err, r) {
              // Fetch the id
              var id = r.ops[0]._id;

              collection.update(
                { _id: id },
                { $inc: { 'meta.visitors': 1 } },
                configuration.writeConcernMax(),
                function(err, r) {
                  test.equal(1, r.result.n);
                  test.equal(null, err);

                  collection.findOne({ _id: id }, function(err, item) {
                    test.equal(1, item.meta.visitors);
                    client.close();
                    done();
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
   * Test findAndModify a document
   * @ignore
   */
  it('Should Correctly Handle FindAndModify Duplicate Key Error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('FindAndModifyDuplicateKeyError', function(err, collection) {
          collection.ensureIndex(['name', 1], { unique: true, w: 1 }, function(err) {
            test.equal(null, err);
            // Test return new document on change
            collection.insert(
              [{ name: 'test1' }, { name: 'test2' }],
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);
                // Let's modify the document in place
                collection.findAndModify(
                  { name: 'test1' },
                  [],
                  { $set: { name: 'test2' } },
                  {},
                  function(err, updated_doc) {
                    test.equal(null, updated_doc);
                    test.ok(err != null);
                    client.close();
                    done();
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
   * @ignore
   */
  it('Should correctly return null when attempting to modify a non-existing document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('AttemptToFindAndModifyNonExistingDocument', function(err, collection) {
          // Let's modify the document in place
          collection.findAndModify({ name: 'test1' }, [], { $set: { name: 'test2' } }, {}, function(
            err,
            updated_doc
          ) {
            test.equal(null, updated_doc.value);
            test.ok(err == null || err.errmsg.match('No matching object found'));
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
  it('Should correctly handle chained skip and limit on find with toArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('skipAndLimitOnFindWithToArray', function(err, collection) {
          collection.insert(
            [{ a: 1 }, { b: 2 }, { c: 3 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              collection
                .find()
                .skip(1)
                .limit(-1)
                .toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(1, items.length);
                  test.equal(2, items[0].b);
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
   */
  it('Should correctly handle chained skip and negative limit on find with toArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('skipAndNegativeLimitOnFindWithToArray', function(err, collection) {
          collection.insert(
            [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }, { e: 5 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              collection
                .find()
                .skip(1)
                .limit(-3)
                .toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(3, items.length);
                  test.equal(2, items[0].b);
                  test.equal(3, items[1].c);
                  test.equal(4, items[2].d);
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
   */
  it('Should correctly pass timeout options to cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('timeoutFalse', function(err, collection) {
          collection.find({}, { timeout: false }, function(err, cursor) {
            test.equal(false, cursor.s.cmd.noCursorTimeout);

            collection.find({}, { timeout: true }, function(err, cursor) {
              test.equal(true, cursor.s.cmd.noCursorTimeout);

              collection.find({}, {}, function(err, cursor) {
                test.ok(!cursor.s.cmd.noCursorTimeout);

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
   * Test findAndModify a document with strict mode enabled
   * @ignore
   */
  it('shouldCorrectlyFindAndModifyDocumentWithDBStrict', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db.createCollection('shouldCorrectlyFindAndModifyDocumentWithDBStrict', function(
          err,
          collection
        ) {
          // Test return old document on change
          collection.insert({ a: 2, b: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Let's modify the document in place
            collection.findAndModify(
              { a: 2 },
              [['a', 1]],
              { $set: { b: 3 } },
              { new: true },
              function(err, result) {
                test.equal(2, result.value.a);
                test.equal(3, result.value.b);
                p_client.close();
                done();
              }
            );
          });
        });
      });
    }
  });

  /**
   * Test findAndModify a document that fails in first step before safe
   * @ignore
   */
  it('shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep', function(
          err,
          collection
        ) {
          // Set up an index to force duplicate index erro
          collection.ensureIndex([['failIndex', 1]], { unique: true, w: 1 }, function(err) {
            test.equal(null, err);

            // Setup a new document
            collection.insert(
              { a: 2, b: 2, failIndex: 2 },
              configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                // Let's attempt to upsert with a duplicate key error
                collection.findAndModify(
                  { c: 2 },
                  [['a', 1]],
                  { a: 10, b: 10, failIndex: 2 },
                  { w: 1, upsert: true },
                  function(err, result) {
                    test.equal(null, result);
                    test.ok(err.errmsg.match('duplicate key'));
                    client.close();
                    done();
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
   * @ignore
   */
  it('Should correctly return new modified document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('Should_correctly_return_new_modified_document', function(
          err,
          collection
        ) {
          var id = new ObjectID();
          var doc = { _id: id, a: 1, b: 1, c: { a: 1, b: 1 } };

          collection.insert(doc, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Find and modify returning the new object
            collection.findAndModify(
              { _id: id },
              [],
              { $set: { 'c.c': 100 } },
              { new: true },
              function(err, item) {
                test.equal(doc._id.toString(), item.value._id.toString());
                test.equal(doc.a, item.value.a);
                test.equal(doc.b, item.value.b);
                test.equal(doc.c.a, item.value.c.a);
                test.equal(doc.c.b, item.value.c.b);
                test.equal(100, item.value.c.c);
                client.close();
                done();
              }
            );
          });
        });
      });
    }
  });

  /**
   * Should correctly execute findAndModify that is breaking in prod
   * @ignore
   */
  it('shouldCorrectlyExecuteFindAndModify', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
          var self = { _id: new ObjectID() };
          var _uuid = 'sddffdss';

          collection.findAndModify(
            { _id: self._id, 'plays.uuid': _uuid },
            [],
            { $set: { 'plays.$.active': true } },
            { new: true, fields: { plays: 0, results: 0 }, safe: true },
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
   */
  it('Should correctly return record with 64-bit id', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID,
        Long = configuration.require.Long;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('should_correctly_return_record_with_64bit_id', function(
          err,
          collection
        ) {
          var _lowerId = new ObjectID();
          var _higherId = new ObjectID();
          var lowerId = new Long.fromString('133118461172916224', 10);
          var higherId = new Long.fromString('133118461172916225', 10);

          var lowerDoc = { _id: _lowerId, id: lowerId };
          var higherDoc = { _id: _higherId, id: higherId };

          collection.insert([lowerDoc, higherDoc], configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Select record with id of 133118461172916225 using $gt directive
            collection.find({ id: { $gt: lowerId } }, {}).toArray(function(err, arr) {
              test.ok(err == null);
              test.equal(
                arr.length,
                1,
                'Selecting record via $gt directive on 64-bit integer should return a record with higher Id'
              );
              test.equal(
                arr[0].id.toString(),
                '133118461172916225',
                'Returned Id should be equal to 133118461172916225'
              );
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
  it('Should Correctly find a Document using findOne excluding _id field', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });
      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db.createCollection(
          'Should_Correctly_find_a_Document_using_findOne_excluding__id_field',
          function(err, collection) {
            var doc = { _id: new ObjectID(), a: 1, c: 2 };
            // insert doc
            collection.insert(doc, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              // Get one document, excluding the _id field
              collection.findOne({ a: 1 }, { fields: { _id: 0 } }, function(err, item) {
                test.equal(undefined, item._id);
                test.equal(1, item.a);
                test.equal(2, item.c);

                collection.find({ a: 1 }, { fields: { _id: 0 } }).toArray(function(err, items) {
                  var item = items[0];
                  test.equal(undefined, item._id);
                  test.equal(1, item.a);
                  test.equal(2, item.c);
                  p_client.close();
                  done();
                });
              });
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly execute find queries with selector set to null', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'Should_correctly_execute_find_and_findOne_queries_in_the_same_way',
          function(err, collection) {
            var doc = { _id: new ObjectID(), a: 1, c: 2, comments: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
            // insert doc
            collection.insert(doc, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);
              collection
                .find({ _id: doc._id })
                .project({ comments: { $slice: -5 } })
                .toArray(function(err, docs) {
                  test.equal(5, docs[0].comments.length);
                  client.close();
                  done();
                });
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists',
          function(err, collection) {
            collection.findAndModify({ a: 1 }, [], { $set: { b: 3 } }, { new: true }, function(
              err,
              updated_doc
            ) {
              test.equal(null, err);
              test.equal(null, updated_doc.value);
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
  it('shouldCorrectlyExecuteFindAndModifyShouldGenerateCorrectBSON', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var transaction = {};
        transaction.document = {};
        transaction.document.type = 'documentType';
        transaction.document.id = new ObjectID();
        transaction.transactionId = new ObjectID();
        transaction.amount = 12.3333;

        var transactions = [];
        transactions.push(transaction);
        // Wrapping object
        var wrapingObject = {
          funds: {
            remaining: 100.5
          },

          transactions: transactions
        };

        db.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
          test.equal(null, err);

          collection.insert(wrapingObject, configuration.writeConcernMax(), function(err, r) {
            test.equal(null, err);

            collection.findOne(
              {
                _id: r.ops[0]._id,
                'funds.remaining': { $gte: 3.0 },
                'transactions.id': { $ne: transaction.transactionId }
              },
              function(err, item) {
                test.ok(item != null);

                collection.findAndModify(
                  {
                    _id: r.ops[0]._id,
                    'funds.remaining': { $gte: 3.0 },
                    'transactions.id': { $ne: transaction.transactionId }
                  },
                  [],
                  { $push: { transactions: transaction } },
                  { new: true, safe: true },
                  function(err) {
                    test.equal(null, err);
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyExecuteMultipleFindsInParallel', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('tasks', function(err, collection) {
          var numberOfOperations = 0;

          // Test return old document on change
          collection.insert({ a: 2, b: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            collection
              .find(
                {
                  user_id: '4e9fc8d55883d90100000003',
                  lc_status: { $ne: 'deleted' },
                  owner_rating: { $exists: false }
                },
                { skip: 0, limit: 10, sort: { updated: -1 } }
              )
              .count(function(err) {
                test.equal(null, err);
                numberOfOperations = numberOfOperations + 1;
                if (numberOfOperations === 2) {
                  done();
                  p_client.close();
                }
              });

            collection
              .find(
                {
                  user_id: '4e9fc8d55883d90100000003',
                  lc_status: { $ne: 'deleted' },
                  owner_rating: { $exists: false }
                },
                { skip: 0, limit: 10, sort: { updated: -1 } }
              )
              .count(function(err) {
                test.equal(null, err);
                numberOfOperations = numberOfOperations + 1;
                if (numberOfOperations === 2) {
                  done();
                  p_client.close();
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
  it('shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError',
          function(err, collection) {
            var q = { x: 1 };
            var set = { y: 2, _id: new ObjectID() };
            var opts = { new: true, upsert: true };
            // Original doc
            var doc = { _id: new ObjectID(), x: 1 };

            // Insert original doc
            collection.insert(doc, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);
              collection.findAndModify(q, [], set, opts, function(/* err */) {
                client.close();
                done();
              });
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyExecuteFindAndModifyUnderConcurrentLoad', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });
      var running = true;

      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Create a collection
        db.collection('collection1', function(err, collection) {
          // Wait a bit and then execute something that will throw a duplicate error
          setTimeout(function() {
            var id = new ObjectID();

            collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function(err) {
                test.ok(err !== null);
                running = false;
                done();
                p_client.close();
              });
            });
          }, 200);
        });

        db.collection('collection2', function(err, collection) {
          // Keep hammering in inserts
          var insert = function() {
            process.nextTick(function() {
              collection.insert({ a: 1 });
              if (running) process.nextTick(insert);
            });
          };
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyIterateOverCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });
      var numberOfSteps = 0;

      // Open db connection
      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('shouldCorrectlyIterateOverCollection');
        // Insert 1000 documents
        var insertF = function(l, callback) {
          collection.insert(
            { a: 1, b: 2, c: { d: 3, f: 'sfdsffffffffffffffffffffffffffffff' } },
            function() {
              l = l - 1;

              if (l > 0) return insertF(l, callback);
              callback();
            }
          );
        };

        insertF(500, function() {
          var cursor = collection.find({}, {});
          cursor.count(function(err) {
            test.equal(null, err);
            cursor.each(function(err, obj) {
              if (obj == null) {
                p_client.close();
                test.equal(500, numberOfSteps);
                done();
              } else {
                numberOfSteps = numberOfSteps + 1;
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
  it('shouldCorrectlyErrorOutFindAndModifyOnDuplicateRecord', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });
      p_client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(err, null);

        db.createCollection('shouldCorrectlyErrorOutFindAndModifyOnDuplicateRecord', function(
          err,
          collection
        ) {
          test.equal(err, null);

          // Test return old document on change
          collection.insert(
            [{ login: 'user1' }, { login: 'user2' }],
            configuration.writeConcernMax(),
            function(err, r) {
              test.equal(err, null);
              var id = r.ops[1]._id;
              // Set an index
              collection.ensureIndex('login', { unique: true, w: 1 }, function(err) {
                test.equal(null, err);

                // Attemp to modify document
                collection.findAndModify(
                  { _id: id },
                  [],
                  { $set: { login: 'user1' } },
                  {},
                  function(err) {
                    test.ok(err !== null);
                    p_client.close();
                    done();
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
   * An example of using find with a very large in parameter
   *
   * @ignore
   */
  it('shouldPerformSimpleFindInArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_in_array', function(err, collection) {
          test.equal(null, err);

          var docs = [];
          for (var i = 0; i < 100; i++) docs.push({ a: i });

          // Insert some test documentations
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Find all the variables in a specific array
            for (var i = 0; i < 100; i++) docs.push(i);

            // Fin all in
            collection.find({ a: { $in: docs } }).toArray(function(err, items) {
              test.equal(null, err);
              test.equal(100, items.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('shouldReturnInstanceofErrorWithBadFieldSelection', {
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

        var col = db.collection('bad_field_selection');
        col.insert(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
          configuration.writeConcernMax(),
          function(err) {
            test.equal(null, err);

            col.find({}, { skip: 1, limit: 1, fields: { _id: 1, b: 0 } }).toArray(function(err) {
              test.ok(err instanceof Error);
              client.close();
              done();
            });
          }
        );
      });
    }
  });

  /**
   * A simple query using find and fields
   */
  it('shouldPerformASimpleLimitSkipFindWithFields', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_with_fields', function(err, collection) {
          test.equal(null, err);

          // Insert a bunch of documents for the testing
          collection.insert(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Perform a simple find and return all the documents
              collection
                .find({ a: 2 })
                .project({ b: 1 })
                .toArray(function(err, docs) {
                  test.equal(null, err);
                  test.equal(1, docs.length);
                  test.equal(undefined, docs[0].a);
                  test.equal(2, docs[0].b);

                  // Perform a simple find and return all the documents
                  collection
                    .find({ a: 2 })
                    .project({ b: 1 })
                    .toArray(function(err, docs) {
                      test.equal(null, err);
                      test.equal(1, docs.length);
                      test.equal(undefined, docs[0].a);
                      test.equal(2, docs[0].b);

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
   * A simple query using find and fields
   */
  it('shouldPerformASimpleLimitSkipFindWithFields2', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_with_fields_2', function(err, collection) {
          test.equal(null, err);

          // Insert a bunch of documents for the testing
          collection.insert(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Perform a simple find and return all the documents
              collection
                .find({ a: 2 })
                .project({ b: 1 })
                .toArray(function(err, docs) {
                  test.equal(null, err);
                  test.equal(1, docs.length);
                  test.equal(undefined, docs[0].a);
                  test.equal(2, docs[0].b);

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
   * A simple query with a different batchSize
   */
  it('shouldPerformQueryWithBatchSizeDifferentToStandard', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('shouldPerformQueryWithBatchSizeDifferentToStandard', function(
          err,
          collection
        ) {
          test.equal(null, err);

          var docs = [];
          for (var i = 0; i < 1000; i++) {
            docs.push({ a: i });
          }

          // Insert a bunch of documents for the testing
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection.find({}, { batchSize: 1000 }).toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(1000, docs.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * A simple query with negative limit
   */
  it('shouldCorrectlyPerformNegativeLimit', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.collection('shouldCorrectlyPerformNegativeLimit', function(err, collection) {
          var docs = [];
          for (var i = 0; i < 1000; i++) {
            docs.push({
              a: 1,
              b:
                'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
            });
          }

          // Insert a bunch of documents
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection
              .find({})
              .limit(-10)
              .toArray(function(err, docs) {
                test.equal(null, err);
                test.equal(10, docs.length);

                client.close();
                done();
              });
          });
        });
      });
    }
  });

  /**
   * Should perform an exhaust find query
   */
  it('shouldCorrectlyExecuteExhaustQuery', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Binary = configuration.require.Binary;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.collection('shouldCorrectlyExecuteExhaustQuery', function(err, collection) {
          test.equal(null, err);

          var docs1 = [];
          for (var i = 0; i < 1000; i++) {
            docs1.push({
              a: 1,
              b:
                'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
              c: new Binary(new Buffer(1024))
            });
          }

          // Insert a bunch of documents
          collection.insert(docs1, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            for (var i = 0; i < 1000; i++) {
              var docs2 = [];
              docs2.push({
                a: 1,
                b:
                  'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
                c: new Binary(new Buffer(1024))
              });
            }

            collection.insert(docs2, configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              // Perform a simple find and return all the documents
              collection.find({}, { exhaust: true }).toArray(function(err, docs3) {
                test.equal(null, err);
                test.equal(docs1.length + docs2.length, docs3.length);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  it('Readpreferences should work fine when using a single server instance', {
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

        var docs = [];
        for (var i = 0; i < 1; i++) {
          docs.push({
            a: 1,
            b:
              'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
          });
        }

        // Create a collection we want to drop later
        db.collection('Readpreferencesshouldworkfine', function(err, collection) {
          // Insert a bunch of documents
          collection.insert(docs, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            // Perform a simple find and return all the documents
            collection.find({}, { exhaust: true }).toArray(function(err, docs2) {
              test.equal(null, err);
              test.equal(docs.length, docs2.length);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('Each should not hang on iterating over no results', {
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
        // Create a collection we want to drop later
        db.collection('noresultAvailableForEachToIterate', function(err, collection) {
          // Perform a simple find and return all the documents
          collection.find({}).each(function(err, item) {
            test.equal(null, item);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('shouldCorrectlyFindDocumentsByRegExp', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
        // the original regex invalid, and leads to segmentation fault.
        db.createCollection('test_regex_serialization', function(err, collection) {
          collection.insert(
            { keywords: ['test', 'segmentation', 'fault', 'regex', 'serialization', 'native'] },
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              var count = 20,
                run = function(i) {
                  // search by regex
                  collection.findOne(
                    { keywords: { $all: [/ser/, /test/, /seg/, /fault/, /nat/] } },
                    function(err, item) {
                      test.equal(6, item.keywords.length);

                      if (i === 0) {
                        client.close();
                        done();
                      }
                    }
                  );
                };
              // loop a few times to catch the / in trailing chars case
              while (count--) {
                run(count);
              }
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyDoFindMinMax', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
        // the original regex invalid, and leads to segmentation fault.
        db.createCollection('shouldCorrectlyDoFindMinMax', function(err, collection) {
          collection.insert(
            { _id: 123, name: 'some name', min: 1, max: 10 },
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              collection
                .find({ _id: { $in: ['some', 'value', 123] } })
                .project({ _id: 1, max: 1 })
                .toArray(function(err, docs) {
                  test.equal(null, err);
                  test.equal(10, docs[0].max);

                  collection
                    .find({ _id: { $in: ['some', 'value', 123] } }, { fields: { _id: 1, max: 1 } })
                    .toArray(function(err, docs) {
                      test.equal(null, err);
                      test.equal(10, docs[0].max);

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

  it('Should correctly execute parallelCollectionScan with multiple cursors using each', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_2');
        // Insert 2000 documents in a batch
        collection.insert(docs, function(err) {
          test.equal(null, err);
          var results = [];
          var numCursors = 3;

          // Execute parallelCollectionScan command
          collection.parallelCollectionScan({ numCursors: numCursors }, function(err, cursors) {
            test.equal(null, err);
            test.ok(cursors != null);
            test.ok(cursors.length > 0);
            test.ok(cursors.length <= numCursors);
            var left = cursors.length;

            for (var i = 0; i < cursors.length; i++) {
              cursors[i].each(function(err, item) {
                test.equal(err, null);

                // Add item to list
                if (item) results.push(item);
                // Finished each
                if (item == null) {
                  left = left - 1;

                  // No more cursors let's ensure we got all results
                  if (left === 0) {
                    test.equal(docs.length, results.length);

                    // Ensure all cursors are closed
                    for (var j = 0; j < cursors.length; j++) {
                      test.equal(true, cursors[j].isClosed());
                    }

                    client.close();
                    return done();
                  }
                }
              });
            }
          });
        });
      });
    }
  });

  it('Should correctly execute parallelCollectionScan with multiple cursors using next', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_3');
        // Insert 1000 documents in a batch
        collection.insert(docs, function(err) {
          test.equal(null, err);
          var results = [];
          var numCursors = 3;

          // Execute parallelCollectionScan command
          collection.parallelCollectionScan({ numCursors: numCursors }, function(err, cursors) {
            test.equal(null, err);
            test.ok(cursors != null);
            test.ok(cursors.length > 0);
            test.ok(cursors.length <= numCursors);

            var left = cursors.length;
            var iterate = _cursor => {
              _cursor.toArray().then(_docs => {
                results = results.concat(_docs);
                left--;

                // No more cursors let's ensure we got all results
                test.equal(true, _cursor.isClosed());
                if (left === 0) {
                  test.equal(docs.length, results.length);
                  client.close();
                  return done();
                }
              });
            };

            for (var i = 0; i < cursors.length; i++) {
              iterate(cursors[i]);
            }
          });
        });
      });
    }
  });

  it('Should correctly execute parallelCollectionScan with single cursor and close', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_4');
        // Insert 1000 documents in a batch
        collection.insert(docs, function(err) {
          test.equal(null, err);
          var numCursors = 1;

          // Execute parallelCollectionScan command
          collection.parallelCollectionScan({ numCursors: numCursors }, function(err, cursors) {
            test.equal(null, err);
            test.ok(cursors != null);
            test.ok(cursors.length > 0);

            cursors[0].close(function(err, result) {
              test.equal(null, err);
              test.ok(result != null);
              test.equal(true, cursors[0].isClosed());
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('Should correctly execute parallelCollectionScan with single cursor streaming', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_5');
        // Insert 1000 documents in a batch
        collection.insert(docs, function(err) {
          test.equal(null, err);
          var results = [];
          var numCursors = 1;

          // Execute parallelCollectionScan command
          collection.parallelCollectionScan({ numCursors: numCursors }, function(err, cursors) {
            test.equal(null, err);
            test.ok(cursors != null);
            test.ok(cursors.length > 0);

            cursors[0].on('data', function(data) {
              results.push(data);
            });

            cursors[0].on('end', function() {
              test.equal(docs.length, results.length);
              test.equal(true, cursors[0].isClosed());
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('Should correctly sort using text search on 2.6 or higher in find', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.5',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Get the collection
        var collection = db.collection('textSearchWithSort');
        collection.ensureIndex({ s: 'text' }, function(err) {
          test.equal(null, err);

          collection.insert(
            [{ s: 'spam' }, { s: 'spam eggs and spam' }, { s: 'sausage and eggs' }],
            function(err) {
              test.equal(null, err);

              collection
                .find(
                  { $text: { $search: 'spam' } },
                  { fields: { _id: false, s: true, score: { $meta: 'textScore' } } }
                )
                .sort({ score: { $meta: 'textScore' } })
                .toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal('spam eggs and spam', items[0].s);
                  client.close();
                  done();
                });
            }
          );
        });
      });
    }
  });

  it('shouldNotMutateUserOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('shouldNotMutateUserOptions');
        var options = { raw: 'TEST' };
        collection.find({}, options, function(error) {
          test.equal(null, error);
          test.equal(undefined, options.skip);
          test.equal(undefined, options.limit);
          test.equal('TEST', options.raw);
          client.close();
          done();
        });
      });
    }
  });

  it(
    'Should correctly execute parallelCollectionScan with single cursor emitting raw buffers and close',
    {
      // Add a tag that our runner can trigger on
      // in this case we are setting that node needs to be higher than 0.10.X to run
      metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          var docs = [];

          // Insert some documents
          for (var i = 0; i < 1000; i++) {
            docs.push({ a: i });
          }

          // Get the collection
          var collection = db.collection('parallelCollectionScan_4');
          // Insert 1000 documents in a batch
          collection.insert(docs, function(err) {
            test.equal(null, err);
            var numCursors = 1;

            // Execute parallelCollectionScan command
            collection.parallelCollectionScan({ numCursors: numCursors, raw: true }, function(
              err,
              cursors
            ) {
              test.equal(null, err);
              test.ok(cursors != null);
              test.ok(cursors.length > 0);

              cursors[0].next(function(err) {
                test.equal(null, err);

                // We need to close the cursor since it is not exhausted,
                // and we need to end the implicit session
                cursors[0].close();
                client.close();
                done();
              });
            });
          });
        });
      }
    }
  );

  it('Should simulate closed cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_4');
        // Insert 1000 documents in a batch
        collection.insert(docs, function(err) {
          test.equal(null, err);

          // Get the cursor
          var cursor = collection.find({}).batchSize(2);
          // Get next document
          cursor.next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc != null);

            // Mess with state forcing a call to isDead on the cursor
            cursor.s.state = 2;

            cursor.next(function(err) {
              test.ok(err !== null);

              // We need to close the cursor since it is not exhausted,
              // and we need to end the implicit session
              cursor.close();
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * Find and modify should allow for a write Concern without failing
   * @ignore
   */
  it('should correctly execute a findAndModifyWithAWriteConcern', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_and_modify_a_document_3', function(err, collection) {
          // Test return new document on change
          collection.insert({ a: 1, b: 2 }, configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            // Let's modify the document in place
            collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b: 3 } },
              { new: true },
              function(err, updated_doc) {
                test.equal(1, updated_doc.value.a);
                test.equal(3, updated_doc.value.b);

                client.close();
                done();
              }
            );
          });
        });
      });
    }
  });

  /**
   * Test a simple find
   * @ignore
   */
  it('should execute query using batchSize of 0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('test_find_simple_batchsize_0', function(err, collection) {
          // Insert some test documents
          collection.insert(
            [{ a: 2 }, { b: 3 }, { b: 4 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              // Ensure correct insertion testing via the cursor and the count function
              collection
                .find()
                .batchSize(-5)
                .toArray(function(err, documents) {
                  test.equal(null, err);
                  test.equal(3, documents.length);
                  // Let's close the db
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
   * Test a simple find
   * @ignore
   */
  it('should execute query using limit of 0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('test_find_simple_limit_0', function(err, collection) {
          test.equal(null, err);

          // Insert some test documents
          collection.insert(
            [{ a: 2 }, { b: 3 }, { b: 4 }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              // Ensure correct insertion testing via the cursor and the count function
              collection
                .find()
                .limit(-5)
                .toArray(function(err, documents) {
                  test.equal(null, err);
                  test.equal(3, documents.length);

                  // Let's close the db
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
   * Test a simple find
   * @ignore
   */
  it('should execute query using $elemMatch', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('elem_match_test', function(err, collection) {
          test.equal(null, err);

          // Insert some test documents
          collection.insert(
            [{ _id: 1, results: [82, 85, 88] }, { _id: 2, results: [75, 88, 89] }],
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Ensure correct insertion testing via the cursor and the count function
              collection
                .find({ results: { $elemMatch: { $gte: 80, $lt: 85 } } })
                .toArray(function(err, documents) {
                  test.equal(null, err);
                  test.deepEqual([{ _id: 1, results: [82, 85, 88] }], documents);

                  // Let's close the db
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
   * Test a simple find
   * @ignore
   */
  it('should execute query using limit of 101', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.collection('test_find_simple_limit_101', function(err, collection) {
          test.equal(null, err);

          function clone(obj) {
            var o = {};
            for (var name in obj) o[name] = obj[name];
            return o;
          }

          var template = {
            linkid: '12633170',
            advertisercid: '4612127',
            websitename: 'Car Rental 8',
            destinationurl: 'https://www.carrental8.com/en/',
            who: '8027061-12633170-1467924618000',
            href: 'http://www.tkqlhce.com',
            src: 'http://www.awltovhc.com',
            r1: 3,
            r2: 44,
            r3: 24,
            r4: 58
          };

          var docs = [];
          for (var i = 0; i < 1000; i++) {
            docs.push(clone(template));
          }

          // Insert some test documents
          collection.insertMany(docs, configuration.writeConcernMax(), function(err, r) {
            test.equal(null, err);
            test.ok(r);

            // Ensure correct insertion testing via the cursor and the count function
            collection
              .find()
              .limit(200)
              .toArray(function(err, documents) {
                test.equal(null, err);
                test.equal(200, documents.length);
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
   * Test a simple find
   * @ignore
   */
  it('Should correctly apply db level options to find cursor', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var listener = require('../..').instrument(function(err) {
        test.equal(null, err);
      });

      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      MongoClient.connect(
        configuration.url(),
        {
          ignoreUndefined: true
        },
        function(err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_find_simple_cursor_inheritance');

          // Insert some test documents
          collection.insert([{ a: 2 }, { b: 3, c: undefined }], function(err) {
            test.equal(null, err);
            // Ensure correct insertion testing via the cursor and the count function
            var cursor = collection.find({ c: undefined });
            test.equal(true, cursor.s.options.ignoreUndefined);

            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
              // process.exit(0)
              listener.uninstrument();

              // Let's close the db
              client.close();
              done();
            });
          });
        }
      );
    }
  });
});
