'use strict';
const { assert: test } = require('../shared');
const { expect } = require('chai');
const sinon = require('sinon');
const { setTimeout } = require('timers');
const { Code, ObjectId, Long, Binary, ReturnDocument } = require('../../mongodb');

describe('Find', function () {
  let client;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  /**
   * Test a simple find
   */
  it('shouldCorrectlyPerformSimpleFind', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      await client.connect();
      this.defer(async () => {
        await client.close();
      });

      const db = client.db(configuration.db);
      await db.dropCollection('test_find_simple').catch(() => null);
      const collection = db.collection('test_find_simple');
      const docs = [{ a: 2 }, { b: 3 }];

      await collection.insert(docs, configuration.writeConcernMax());

      const insertedDocs = await collection.find().toArray();
      expect(insertedDocs).to.have.length(2);

      const docCount = await collection.count();
      expect(docCount).to.equal(2);

      const valuesBySelection = await collection.find({ a: docs[0].a }).toArray();
      expect(valuesBySelection).to.have.length(1);
      expect(valuesBySelection[0].a).to.deep.equal(docs[0].a);
    }
  });

  /**
   * Test a simple find chained
   */
  it('shouldCorrectlyPerformSimpleChainedFind', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_simple_chained', function (err) {
          expect(err).to.not.exist;
          const collection = db.collection('test_find_simple_chained');
          const docs = [{ a: 2 }, { b: 3 }];

          // Insert some test documents
          collection.insert(docs, configuration.writeConcernMax(), err => {
            expect(err).to.not.exist;

            // Ensure correct insertion testing via the cursor and the count function
            collection.find().toArray(function (err, documents) {
              test.equal(2, documents.length);

              collection.count(function (err, count) {
                test.equal(2, count);

                // Fetch values by selection
                collection.find({ a: docs[0].a }).toArray(function (err, documents) {
                  test.equal(1, documents.length);
                  test.equal(docs[0].a, documents[0].a);
                  // Let's close the db
                  client.close(done);
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
   */
  it('shouldCorrectlyPerformAdvancedFinds', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      await client.connect();
      this.defer(async () => await client.close());

      //await client.db(configuration.db).dropDatabase(configuration.db);
      const db = client.db(configuration.db);
      await db.dropCollection('test_find_advanced').catch(() => null);
      const collection = db.collection('test_find_advanced');
      const docs = [{ a: 1 }, { a: 2 }, { b: 3 }];

      await collection.insert(docs, configuration.writeConcernMax());

      const aLT10Docs = await collection.find({ a: { $lt: 10 } }).toArray();
      expect(aLT10Docs).to.have.length(2);
      expect(aLT10Docs.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

      const aGT1 = await collection.find({ a: { $gt: 1 } }).toArray();
      expect(aGT1).to.have.length(1);
      expect(aGT1[0].a).to.equal(2);

      const aLTE1 = await collection.find({ a: { $lte: 1 } }).toArray();
      expect(aLTE1).to.have.length(1);
      expect(aLTE1[0].a).to.equal(1);

      const aGTE1 = await collection.find({ a: { $gte: 1 } }).toArray();
      expect(aGTE1).to.have.length(2);

      expect(aGTE1.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

      const aGT1LT3 = await collection.find({ a: { $gt: 1, $lt: 3 } }).toArray();
      expect(aGT1LT3).to.have.length(1);
      expect(aGT1LT3[0].a).to.equal(2);

      const aIN = await collection.find({ a: { $in: [1, 2] } }).toArray();
      expect(aIN).to.have.length(2);

      expect(aIN.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

      const byID = await collection
        .find({ _id: { $in: [docs[0]['_id'], docs[1]['_id']] } })
        .toArray();
      expect(byID).to.have.length(2);
      expect(byID.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);
    }
  });
  /**
   * Test sorting of results
   */
  it('shouldCorrectlyPerformFindWithSort', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_sorting', function (err) {
          expect(err).to.not.exist;

          const collection = db.collection('test_find_sorting');
          // Insert some test documents
          collection.insert(
            [
              { a: 1, b: 2 },
              { a: 2, b: 1 },
              { a: 3, b: 2 },
              { a: 4, b: 1 }
            ],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // Test sorting (ascending)
              collection
                .find({ a: { $lt: 10 } }, { sort: [['a', 1]] })
                .toArray(function (err, documents) {
                  test.equal(4, documents.length);
                  test.equal(1, documents[0].a);
                  test.equal(2, documents[1].a);
                  test.equal(3, documents[2].a);
                  test.equal(4, documents[3].a);

                  // Test sorting (descending)
                  collection
                    .find({ a: { $lt: 10 } }, { sort: [['a', -1]] })
                    .toArray(function (err, documents) {
                      test.equal(4, documents.length);
                      test.equal(4, documents[0].a);
                      test.equal(3, documents[1].a);
                      test.equal(2, documents[2].a);
                      test.equal(1, documents[3].a);

                      // Test sorting (descending), sort is hash
                      collection
                        .find({ a: { $lt: 10 } }, { sort: { a: -1 } })
                        .toArray(function (err, documents) {
                          test.equal(4, documents.length);
                          test.equal(4, documents[0].a);
                          test.equal(3, documents[1].a);
                          test.equal(2, documents[2].a);
                          test.equal(1, documents[3].a);

                          // Sorting using array of names, assumes ascending order
                          collection
                            .find({ a: { $lt: 10 } }, { sort: ['a'] })
                            .toArray(function (err, documents) {
                              test.equal(4, documents.length);
                              test.equal(1, documents[0].a);
                              test.equal(2, documents[1].a);
                              test.equal(3, documents[2].a);
                              test.equal(4, documents[3].a);

                              // Sorting using single name, assumes ascending order
                              collection
                                .find({ a: { $lt: 10 } }, { sort: 'a' })
                                .toArray(function (err, documents) {
                                  test.equal(4, documents.length);
                                  test.equal(1, documents[0].a);
                                  test.equal(2, documents[1].a);
                                  test.equal(3, documents[2].a);
                                  test.equal(4, documents[3].a);

                                  // Sorting using single name, assumes ascending order, sort is hash
                                  collection
                                    .find({ a: { $lt: 10 } }, { sort: { a: 1 } })
                                    .toArray(function (err, documents) {
                                      test.equal(4, documents.length);
                                      test.equal(1, documents[0].a);
                                      test.equal(2, documents[1].a);
                                      test.equal(3, documents[2].a);
                                      test.equal(4, documents[3].a);

                                      collection
                                        .find({ a: { $lt: 10 } }, { sort: ['b', 'a'] })
                                        .toArray(function (err, documents) {
                                          test.equal(4, documents.length);
                                          test.equal(2, documents[0].a);
                                          test.equal(4, documents[1].a);
                                          test.equal(1, documents[2].a);
                                          test.equal(3, documents[3].a);

                                          // Sorting using empty array, no order guarantee should not blow up
                                          collection
                                            .find({ a: { $lt: 10 } }, { sort: [] })
                                            .toArray(function (err, documents) {
                                              test.equal(4, documents.length);

                                              /* NONACTUAL */
                                              // Sorting using ordered hash
                                              collection
                                                .find({ a: { $lt: 10 } }, { sort: { a: -1 } })
                                                .toArray(function (err, documents) {
                                                  // Fail test if not an error
                                                  test.equal(4, documents.length);
                                                  // Let's close the db
                                                  client.close(done);
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
    }
  });

  /**
   * Test the limit function of the db
   */
  it('shouldCorrectlyPerformFindWithLimit', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_limits', function (err) {
          expect(err).to.not.exist;

          const collection = db.collection('test_find_limits');
          // Insert some test documents
          collection.insert(
            [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // Test limits
              collection.find({}, { limit: 1 }).toArray(function (err, documents) {
                test.equal(1, documents.length);

                collection.find({}, { limit: 2 }).toArray(function (err, documents) {
                  test.equal(2, documents.length);

                  collection.find({}, { limit: 3 }).toArray(function (err, documents) {
                    test.equal(3, documents.length);

                    collection.find({}, { limit: 4 }).toArray(function (err, documents) {
                      test.equal(4, documents.length);

                      collection.find({}, {}).toArray(function (err, documents) {
                        test.equal(4, documents.length);

                        collection.find({}, { limit: 99 }).toArray(function (err, documents) {
                          test.equal(4, documents.length);
                          // Let's close the db
                          client.close(done);
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
    }
  });

  /**
   * Test find by non-quoted values (issue #128)
   */
  it('shouldCorrectlyFindWithNonQuotedValues', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_non_quoted_values', function (err) {
          expect(err).to.not.exist;

          const collection = db.collection('test_find_non_quoted_values');
          // insert test document
          collection.insert(
            [
              { a: 19, b: 'teststring', c: 59920303 },
              { a: '19', b: 'teststring', c: 3984929 }
            ],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              collection.find({ a: 19 }).toArray(function (err, documents) {
                test.equal(1, documents.length);
                client.close(done);
              });
            }
          );
        });
      });
    }
  });

  /**
   * Test for querying embedded document using dot-notation (issue #126)
   */
  it('shouldCorrectlyFindEmbeddedDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_embedded_document', function (err) {
          expect(err).to.not.exist;

          const collection = db.collection('test_find_embedded_document');
          // insert test document
          collection.insert(
            [
              { a: { id: 10, value: 'foo' }, b: 'bar', c: { id: 20, value: 'foobar' } },
              { a: { id: 11, value: 'foo' }, b: 'bar2', c: { id: 20, value: 'foobar' } }
            ],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // test using integer value
              collection.find({ 'a.id': 10 }).toArray(function (err, documents) {
                test.equal(1, documents.length);
                test.equal('bar', documents[0].b);

                // test using string value
                collection.find({ 'a.value': 'foo' }).toArray(function (err, documents) {
                  // should yield 2 documents
                  test.equal(2, documents.length);
                  test.equal('bar', documents[0].b);
                  test.equal('bar2', documents[1].b);
                  client.close(done);
                });
              });
            }
          );
        });
      });
    }
  });

  /**
   * Find no records
   */
  it('shouldCorrectlyFindNoRecords', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_one_no_records', function (err) {
          expect(err).to.not.exist;
          const collection = db.collection('test_find_one_no_records');
          expect(err).to.not.exist;
          collection.find({ a: 1 }, {}).toArray(function (err, documents) {
            test.equal(0, documents.length);
            // Let's close the db
            client.close(done);
          });
        });
      });
    }
  });

  it('shouldCorrectlyPerformFindByWhere', {
    metadata: {
      requires: {
        mongodb: '<=4.2.x',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_where', function (err, collection) {
          collection.insert(
            [{ a: 1 }, { a: 2 }, { a: 3 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              collection.count(function (err, count) {
                expect(err).to.not.exist;
                test.equal(3, count);

                // Let's test usage of the $where statement
                collection.find({ $where: new Code('this.a > 2') }).count(function (err, count) {
                  expect(err).to.not.exist;
                  test.equal(1, count);

                  collection
                    .find({ $where: new Code('this.a > i', { i: 1 }) })
                    .count(function (err, count) {
                      expect(err).to.not.exist;
                      test.equal(2, count);

                      // Let's close the db
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

  it('shouldCorrectlyPerformFindsWithHintTurnedOn', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_hint', function (err, collection) {
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            db.createIndex(
              collection.collectionName,
              'a',
              configuration.writeConcernMax(),
              function (err) {
                expect(err).to.not.exist;
                collection.find({ a: 1 }, { hint: 'a' }).toArray(function (err) {
                  test.ok(err != null);

                  collection.find({ a: 1 }, { hint: ['a'] }).toArray(function (err, items) {
                    expect(err).to.not.exist;
                    test.equal(1, items.length);

                    collection.find({ a: 1 }, { hint: { a: 1 } }).toArray(function (err, items) {
                      test.equal(1, items.length);

                      // Modify hints
                      collection.hint = 'a_1';
                      test.equal('a_1', collection.hint);
                      collection.find({ a: 1 }).toArray(function (err, items) {
                        test.equal(1, items.length);

                        collection.hint = ['a'];
                        test.equal(1, collection.hint['a']);
                        collection.find({ a: 1 }).toArray(function (err, items) {
                          test.equal(1, items.length);

                          collection.hint = { a: 1 };
                          test.equal(1, collection.hint['a']);
                          collection.find({ a: 1 }).toArray(function (err, items) {
                            test.equal(1, items.length);

                            collection.hint = null;
                            test.ok(collection.hint == null);
                            collection.find({ a: 1 }).toArray(function (err, items) {
                              test.equal(1, items.length);
                              // Let's close the db
                              client.close(done);
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

  it('shouldCorrectlyPerformFindByObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect((err, client) => {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        db.createCollection('test_find_by_oid', (err, collection) => {
          collection.insertOne({ hello: 'mike' }, configuration.writeConcernMax(), (err, r) => {
            expect(err).to.not.exist;
            expect(r).property('insertedId').to.exist;

            collection.findOne({ _id: r.insertedId }, (err, doc) => {
              test.equal('mike', doc.hello);

              var id = doc._id.toString();
              collection.findOne({ _id: new ObjectId(id) }, (err, doc) => {
                test.equal('mike', doc.hello);
                // Let's close the db
                client.close(done);
              });
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyReturnDocumentWithOriginalStructure', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_by_oid_with_subdocs', function (err, collection) {
          var c1 = { _id: new ObjectId(), comments: [], title: 'number 1' };
          var c2 = { _id: new ObjectId(), comments: [], title: 'number 2' };
          var doc = {
            numbers: [],
            owners: [],
            comments: [c1, c2],
            _id: new ObjectId()
          };

          collection.insert(doc, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            collection.findOne(
              { _id: doc._id },
              { writeConcern: { w: 1 }, projection: undefined },
              function (err, doc) {
                expect(err).to.not.exist;
                test.equal(2, doc.comments.length);
                test.equal('number 1', doc.comments[0].title);
                test.equal('number 2', doc.comments[1].title);

                client.close(done);
              }
            );
          });
        });
      });
    }
  });

  it('shouldCorrectlyRetrieveSingleRecord', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);

        db.createCollection(
          'test_should_correctly_retrieve_one_record',
          function (err, collection) {
            collection.insert({ a: 0 }, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;
              const usercollection = db.collection('test_should_correctly_retrieve_one_record');
              usercollection.findOne({ a: 0 }, function (err) {
                expect(err).to.not.exist;
                p_client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyHandleError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_one_error_handling', function (err, collection) {
          // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
          // is the error handling of the findOne Method
          try {
            collection.findOne(
              { _id: ObjectId.createFromHexString('5e9bd59248305adf18ebc15703a1') },
              function () {}
            );
          } catch (err) {
            client.close(done);
          }
        });
      });
    }
  });

  /**
   * Test field select with options
   */
  it('shouldCorrectlyPerformFindWithOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_field_select_with_options', function (err) {
          expect(err).to.not.exist;
          const collection = db.collection('test_field_select_with_options');
          var docCount = 25,
            docs = [];

          // Insert some test documents
          while (docCount--) docs.push({ a: docCount, b: docCount });
          collection.insert(docs, configuration.writeConcernMax(), function (err, retDocs) {
            docs = retDocs;

            collection
              .find({}, { limit: 3, sort: [['a', -1]], projection: { a: 1 } })
              .toArray(function (err, documents) {
                test.equal(3, documents.length);

                documents.forEach(function (doc, idx) {
                  expect(doc.b).to.not.exist; // making sure field select works
                  test.equal(24 - idx, doc.a); // checking limit sort object with field select
                });

                client.close(done);
              });
          });
        });
      });
    }
  });

  /**
   * Test findOneAndUpdate a document with fields
   */
  it('returns selected fields only for findOneAndUpdate', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      await client.connect();
      this.defer(async () => {
        await client.close();
      });
      const db = client.db(configuration.db);
      const coll = db.collection('test_find_and_modify_a_document_2');
      await coll.insert({ a: 1, b: 2 }, configuration.writeConcernMax());

      const updatedDoc = await coll.findOneAndUpdate(
        { a: 1 },
        { $set: { b: 3 } },
        { returnDocument: ReturnDocument.AFTER, projection: { a: 1 } }
      );

      expect(Object.keys(updatedDoc).length).to.equal(2);
      expect(updatedDoc.a).to.equal(1);
    }
  });

  it('ShouldCorrectlyLocatePostAndIncValues', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var db = client.db(configuration.db);
      db.createCollection(
        'shouldCorrectlyExecuteFindOneWithAnInSearchTag',
        function (err, collection) {
          // Test return new document on change
          collection.insert(
            {
              title: 'Tobi',
              author: 'Brian',
              newTitle: 'Woot',
              meta: { visitors: 0 }
            },
            configuration.writeConcernMax(),
            function (err, r) {
              // Fetch the id
              var id = r.insertedIds[0];

              collection.update(
                { _id: id },
                { $inc: { 'meta.visitors': 1 } },
                configuration.writeConcernMax(),
                function (err, r) {
                  expect(r).property('matchedCount').to.equal(1);
                  expect(err).to.not.exist;

                  collection.findOne({ _id: id }, function (err, item) {
                    test.equal(1, item.meta.visitors);
                    client.close(done);
                  });
                }
              );
            }
          );
        }
      );
    }
  });

  it('Should correctly return null when attempting to modify a non-existing document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      await client.connect();
      this.defer(async () => {
        await client.close();
      });

      const db = client.db(configuration.db);
      const coll = db.collection('AttemptTofindOneAndUpdateNonExistingDocument');

      const updatedDoc = await coll.findOneAndUpdate(
        { name: 'test1' },
        { $set: { name: 'test2' } },
        {}
      );

      expect(updatedDoc).to.be.null;
    }
  });

  it('Should correctly handle chained skip and limit on find with toArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('skipAndLimitOnFindWithToArray', function (err, collection) {
          collection.insert(
            [{ a: 1 }, { b: 2 }, { c: 3 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              collection
                .find()
                .skip(1)
                .limit(-1)
                .toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(1, items.length);
                  test.equal(2, items[0].b);
                  client.close(done);
                });
            }
          );
        });
      });
    }
  });

  it('Should correctly handle chained skip and negative limit on find with toArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('skipAndNegativeLimitOnFindWithToArray', function (err, collection) {
          collection.insert(
            [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }, { e: 5 }],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;
              collection
                .find()
                .skip(1)
                .limit(-3)
                .toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(3, items.length);
                  test.equal(2, items[0].b);
                  test.equal(3, items[1].c);
                  test.equal(4, items[2].d);
                  client.close(done);
                });
            }
          );
        });
      });
    }
  });

  it('should support a timeout option for find operations', async function () {
    const client = this.configuration.newClient({ monitorCommands: true });
    const events = [];
    client.on('commandStarted', event => {
      if (event.commandName === 'find') {
        events.push(event);
      }
    });
    const db = client.db(this.configuration.db);
    const collection = await db.createCollection('cursor_timeout_false_0');
    await collection.find({}, { timeout: false }).toArray();
    expect(events[0]).nested.property('command.noCursorTimeout').to.equal(true);
    await client.close();
  });

  it('should correctly findOneAndUpdate document with DB strict', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);

        db.createCollection(
          'shouldCorrectlyfindOneAndUpdateDocumentWithDBStrict',
          function (err, collection) {
            // Test return old document on change
            collection.insert({ a: 2, b: 2 }, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;

              // Let's modify the document in place
              collection.findOneAndUpdate(
                { a: 2 },
                { $set: { b: 3 } },
                { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true },
                function (err, result) {
                  expect(result.value.a).to.equal(2);
                  expect(result.value.b).to.equal(3);
                  p_client.close(done);
                }
              );
            });
          }
        );
      });
    }
  });

  /**
   * Test findOneAndUpdate a document that fails in first step before safe
   */
  it('shouldCorrectlyfindOneAndUpdateDocumentThatFailsInFirstStep', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlyfindOneAndUpdateDocumentThatFailsInFirstStep',
          function (err, collection) {
            expect(err).to.not.exist;
            // Set up an index to force duplicate index erro
            collection.createIndex(
              [['failIndex', 1]],
              { unique: true, writeConcern: { w: 1 } },
              function (err) {
                expect(err).to.not.exist;

                // Setup a new document
                collection.insert(
                  { a: 2, b: 2, failIndex: 2 },
                  configuration.writeConcernMax(),
                  function (err) {
                    expect(err).to.not.exist;

                    // Let's attempt to upsert with a duplicate key error
                    collection.findOneAndUpdate(
                      { c: 2 },
                      { $set: { a: 10, b: 10, failIndex: 2 } },
                      { writeConcern: { w: 1 }, upsert: true },
                      function (err, result) {
                        expect(result).to.not.exist;
                        expect(err)
                          .property('errmsg')
                          .to.match(/duplicate key/);
                        client.close(done);
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
  });

  it('Should correctly return new modified document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      await client.connect();
      this.defer(async () => {
        await client.close();
      });

      const db = client.db(configuration.db);
      const col = await db.collection('Should_correctly_return_new_modified_document');

      const id = new ObjectId();
      const doc = { _id: id, a: 1, b: 1, c: { a: 1, b: 1 } };

      await col.insert(doc, configuration.writeConcernMax());

      const item = await col.findOneAndUpdate(
        { _id: id },
        { $set: { 'c.c': 100 } },
        { returnDocument: ReturnDocument.AFTER }
      );

      expect(item._id.toString()).to.equal(doc._id.toString());
      expect(item.a).to.equal(doc.a);
      expect(item.b).to.equal(doc.b);
      expect(item.c.a).to.equal(doc.c.a);
      expect(item.c.b).to.equal(doc.c.b);
      expect(item.c.c).to.equal(100);
    }
  });

  /**
   * Should correctly execute findOneAndUpdate that is breaking in prod
   */
  it('shouldCorrectlyExecutefindOneAndUpdate', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('execute_find_and_modify', function (err, collection) {
          var self = { _id: new ObjectId() };
          var _uuid = 'sddffdss';

          collection.findOneAndUpdate(
            { _id: self._id, 'plays.uuid': _uuid },
            { $set: { 'plays.$.active': true } },
            {
              returnDocument: ReturnDocument.AFTER,
              projection: { plays: 0, results: 0 },
              safe: true
            },
            function (err) {
              expect(err).to.not.exist;
              client.close(done);
            }
          );
        });
      });
    }
  });

  it('Should correctly return record with 64-bit id', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'should_correctly_return_record_with_64bit_id',
          function (err, collection) {
            var _lowerId = new ObjectId();
            var _higherId = new ObjectId();
            var lowerId = Long.fromString('133118461172916224', 10);
            var higherId = Long.fromString('133118461172916225', 10);

            var lowerDoc = { _id: _lowerId, id: lowerId };
            var higherDoc = { _id: _higherId, id: higherId };

            collection.insert(
              [lowerDoc, higherDoc],
              configuration.writeConcernMax(),
              function (err) {
                expect(err).to.not.exist;

                // Select record with id of 133118461172916225 using $gt directive
                collection.find({ id: { $gt: lowerId } }, {}).toArray(function (err, arr) {
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
                  client.close(done);
                });
              }
            );
          }
        );
      });
    }
  });

  it('Should Correctly find a Document using findOne excluding _id field', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);

        db.createCollection(
          'Should_Correctly_find_a_Document_using_findOne_excluding__id_field',
          function (err, collection) {
            var doc = { _id: new ObjectId(), a: 1, c: 2 };
            // insert doc
            collection.insert(doc, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;

              // Get one document, excluding the _id field
              collection.findOne({ a: 1 }, { projection: { _id: 0 } }, function (err, item) {
                expect(item._id).to.not.exist;
                test.equal(1, item.a);
                test.equal(2, item.c);

                collection
                  .find({ a: 1 }, { projection: { _id: 0 } })
                  .toArray(function (err, items) {
                    var item = items[0];
                    expect(item._id).to.not.exist;
                    test.equal(1, item.a);
                    test.equal(2, item.c);
                    p_client.close(done);
                  });
              });
            });
          }
        );
      });
    }
  });

  it('Should correctly execute find queries with selector set to null', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'Should_correctly_execute_find_and_findOne_queries_in_the_same_way',
          function (err, collection) {
            var doc = { _id: new ObjectId(), a: 1, c: 2, comments: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
            // insert doc
            collection.insert(doc, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;
              collection
                .find({ _id: doc._id })
                .project({ comments: { $slice: -5 } })
                .toArray(function (err, docs) {
                  test.equal(5, docs[0].comments.length);
                  client.close(done);
                });
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyHandlerErrorForfindOneAndUpdateWhenNoRecordExists', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlyHandlerErrorForfindOneAndUpdateWhenNoRecordExists',
          function (err, collection) {
            collection.findOneAndUpdate(
              { a: 1 },
              { $set: { b: 3 } },
              { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true },
              function (err, updated_doc) {
                expect(err).to.not.exist;
                expect(updated_doc.value).to.not.exist;
                client.close(done);
              }
            );
          }
        );
      });
    }
  });

  it('shouldCorrectlyExecutefindOneAndUpdateShouldGenerateCorrectBSON', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var db = client.db(configuration.db);
      var transaction = {};
      transaction.document = {};
      transaction.document.type = 'documentType';
      transaction.document.id = new ObjectId();
      transaction.transactionId = new ObjectId();
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

      db.createCollection('find_and_modify_generate_correct_bson', function (err, collection) {
        expect(err).to.not.exist;

        collection.insert(wrapingObject, configuration.writeConcernMax(), function (err, r) {
          expect(err).to.not.exist;

          collection.findOne(
            {
              _id: r.insertedIds[0],
              'funds.remaining': { $gte: 3.0 },
              'transactions.id': { $ne: transaction.transactionId }
            },
            function (err, item) {
              test.ok(item != null);

              collection.findOneAndUpdate(
                {
                  _id: r.insertedIds[0],
                  'funds.remaining': { $gte: 3.0 },
                  'transactions.id': { $ne: transaction.transactionId }
                },
                { $push: { transactions: transaction } },
                { returnDocument: ReturnDocument.AFTER, safe: true, includeResultMetadata: true },
                function (err) {
                  expect(err).to.not.exist;
                  client.close(done);
                }
              );
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyExecuteMultipleFindsInParallel', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('tasks', function (err, collection) {
          var numberOfOperations = 0;

          // Test return old document on change
          collection.insert({ a: 2, b: 2 }, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            collection
              .find(
                {
                  user_id: '4e9fc8d55883d90100000003',
                  lc_status: { $ne: 'deleted' },
                  owner_rating: { $exists: false }
                },
                { skip: 0, limit: 10, sort: { updated: -1 } }
              )
              .count(function (err) {
                expect(err).to.not.exist;
                numberOfOperations = numberOfOperations + 1;
                if (numberOfOperations === 2) {
                  p_client.close(done);
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
              .count(function (err) {
                expect(err).to.not.exist;
                numberOfOperations = numberOfOperations + 1;
                if (numberOfOperations === 2) {
                  p_client.close(done);
                }
              });
          });
        });
      });
    }
  });

  it('shouldCorrectlyReturnErrorFromMongodbOnfindOneAndUpdateForcedError', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlyReturnErrorFromMongodbOnfindOneAndUpdateForcedError',
          function (err, collection) {
            var q = { x: 1 };
            var set = { y: 2, _id: new ObjectId() };
            var opts = {
              returnDocument: ReturnDocument.AFTER,
              upsert: true,
              includeResultMetadata: true
            };
            // Original doc
            var doc = { _id: new ObjectId(), x: 1 };

            // Insert original doc
            collection.insert(doc, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;
              collection.findOneAndUpdate(q, { $set: set }, opts, function (/* err */) {
                client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('shouldCorrectlyExecutefindOneAndUpdateUnderConcurrentLoad', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      var running = true;

      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // Create a collection
        db.createCollection('collection1', function (err, collection) {
          // Wait a bit and then execute something that will throw a duplicate error
          setTimeout(function () {
            var id = new ObjectId();

            collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;

              collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function (err) {
                test.ok(err !== null);
                running = false;
                p_client.close(done);
              });
            });
          }, 200);
        });

        db.createCollection('collection2', function (err, collection) {
          // Keep hammering in inserts
          var insert;
          insert = function () {
            process.nextTick(function () {
              collection.insert({ a: 1 });
              if (running) process.nextTick(insert);
            });
          };
        });
      });
    }
  });

  // TODO: NODE-3819: Unskip flaky tests.
  it.skip('shouldCorrectlyIterateOverCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      var numberOfSteps = 0;

      // Open db connection
      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('shouldCorrectlyIterateOverCollection');
        // Insert 1000 documents
        var insertF = function (l, callback) {
          collection.insert(
            { a: 1, b: 2, c: { d: 3, f: 'sfdsffffffffffffffffffffffffffffff' } },
            function () {
              l = l - 1;

              if (l > 0) return insertF(l, callback);
              callback();
            }
          );
        };

        insertF(500, function () {
          var cursor = collection.find({}, {});
          cursor.count(function (err) {
            expect(err).to.not.exist;
            cursor.forEach(
              doc => {
                expect(doc).to.exist;
                numberOfSteps = numberOfSteps + 1;
              },
              err => {
                expect(err).to.not.exist;
                test.equal(500, numberOfSteps);
                p_client.close(done);
              }
            );
          });
        });
      });
    }
  });

  it('shouldCorrectlyErrorOutfindOneAndUpdateOnDuplicateRecord', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      p_client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        db.createCollection(
          'shouldCorrectlyErrorOutfindOneAndUpdateOnDuplicateRecord',
          function (err, collection) {
            expect(err).to.not.exist;

            // Test return old document on change
            collection.insert(
              [{ login: 'user1' }, { login: 'user2' }],
              configuration.writeConcernMax(),
              function (err, r) {
                expect(err).to.not.exist;
                var id = r.insertedIds[1];
                // Set an index
                collection.createIndex(
                  'login',
                  { unique: true, writeConcern: { w: 1 } },
                  function (err) {
                    expect(err).to.not.exist;

                    // Attemp to modify document
                    collection.findOneAndUpdate(
                      { _id: id },
                      { $set: { login: 'user1' } },
                      { includeResultMetadata: true },
                      function (err) {
                        test.ok(err !== null);
                        p_client.close(done);
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
  });

  /**
   * An example of using find with a very large in parameter
   */
  it('shouldPerformSimpleFindInArray', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_in_array', function (err, collection) {
          expect(err).to.not.exist;

          var docs = [];
          for (var i = 0; i < 100; i++) docs.push({ a: i });

          // Insert some test documentations
          collection.insert(docs, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            // Find all the variables in a specific array
            for (var i = 0; i < 100; i++) docs.push(i);

            // Fin all in
            collection.find({ a: { $in: docs } }).toArray(function (err, items) {
              expect(err).to.not.exist;
              test.equal(100, items.length);

              client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        var col = db.collection('bad_field_selection');
        col.insert(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 }
          ],
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;

            col.find({}, { skip: 1, limit: 1, projection: { a: 1, b: 0 } }).toArray(function (err) {
              test.ok(err instanceof Error);
              client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_with_fields', function (err, collection) {
          expect(err).to.not.exist;

          // Insert a bunch of documents for the testing
          collection.insert(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 }
            ],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // Perform a simple find and return all the documents
              collection
                .find({ a: 2 })
                .project({ b: 1 })
                .toArray(function (err, docs) {
                  expect(err).to.not.exist;
                  test.equal(1, docs.length);
                  expect(docs[0].a).to.not.exist;
                  test.equal(2, docs[0].b);

                  // Perform a simple find and return all the documents
                  collection
                    .find({ a: 2 })
                    .project({ b: 1 })
                    .toArray(function (err, docs) {
                      expect(err).to.not.exist;
                      test.equal(1, docs.length);
                      expect(docs[0].a).to.not.exist;
                      test.equal(2, docs[0].b);

                      client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('simple_find_with_fields_2', function (err, collection) {
          expect(err).to.not.exist;

          // Insert a bunch of documents for the testing
          collection.insert(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 }
            ],
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              // Perform a simple find and return all the documents
              collection
                .find({ a: 2 })
                .project({ b: 1 })
                .toArray(function (err, docs) {
                  expect(err).to.not.exist;
                  test.equal(1, docs.length);
                  expect(docs[0].a).to.not.exist;
                  test.equal(2, docs[0].b);

                  client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection(
          'shouldPerformQueryWithBatchSizeDifferentToStandard',
          function (err, collection) {
            expect(err).to.not.exist;

            var docs = [];
            for (var i = 0; i < 1000; i++) {
              docs.push({ a: i });
            }

            // Insert a bunch of documents for the testing
            collection.insert(docs, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;

              // Perform a simple find and return all the documents
              collection.find({}, { batchSize: 1000 }).toArray(function (err, docs) {
                expect(err).to.not.exist;
                test.equal(1000, docs.length);

                client.close(done);
              });
            });
          }
        );
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        const collection = db.collection('shouldCorrectlyPerformNegativeLimit');
        var docs = [];
        for (var i = 0; i < 1000; i++) {
          docs.push({
            a: 1,
            b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
          });
        }

        // Insert a bunch of documents
        collection.insert(docs, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;

          // Perform a simple find and return all the documents
          collection
            .find({})
            .limit(-10)
            .toArray(function (err, docs) {
              expect(err).to.not.exist;
              test.equal(10, docs.length);

              client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Create a collection we want to drop later
        db.createCollection('shouldCorrectlyExecuteExhaustQuery', function (err, collection) {
          expect(err).to.not.exist;

          var docs1 = [];
          for (var i = 0; i < 1000; i++) {
            docs1.push({
              a: 1,
              b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
              c: new Binary(Buffer.alloc(1024))
            });
          }

          // Insert a bunch of documents
          collection.insert(docs1, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            for (var i = 0; i < 1000; i++) {
              var docs2 = [];
              docs2.push({
                a: 1,
                b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
                c: new Binary(Buffer.alloc(1024))
              });
            }

            collection.insert(docs2, configuration.writeConcernMax(), function (err) {
              expect(err).to.not.exist;

              // Perform a simple find and return all the documents
              collection.find({}, { exhaust: true }).toArray(function (err, docs3) {
                expect(err).to.not.exist;
                test.equal(docs1.length + docs2.length, docs3.length);

                client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        var docs = [];
        for (var i = 0; i < 1; i++) {
          docs.push({
            a: 1,
            b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
          });
        }

        // Create a collection we want to drop later
        db.createCollection('Readpreferencesshouldworkfine', function (err, collection) {
          // Insert a bunch of documents
          collection.insert(docs, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            // Perform a simple find and return all the documents
            collection.find({}, { exhaust: true }).toArray(function (err, docs2) {
              expect(err).to.not.exist;
              test.equal(docs.length, docs2.length);

              client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create a collection we want to drop later
        const collection = db.collection('noresultAvailableForEachToIterate');
        // Perform a simple find and return all the documents
        collection.find({}).forEach(
          doc => {
            expect(doc).to.not.exist;
          },
          err => {
            expect(err).to.not.exist;
            client.close(done);
          }
        );
      });
    }
  });

  it('shouldCorrectlyFindDocumentsByRegExp', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
        // the original regex invalid, and leads to segmentation fault.
        db.createCollection('test_regex_serialization', function (err, collection) {
          collection.insert(
            { keywords: ['test', 'segmentation', 'fault', 'regex', 'serialization', 'native'] },
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              let count = 0;
              for (let i = 0; i <= 20; ++i) {
                // search by regex
                collection.findOne(
                  { keywords: { $all: [/ser/, /test/, /seg/, /fault/, /nat/] } },
                  function (err, item) {
                    expect(err).to.not.exist;
                    expect(item).property('keywords').to.have.length(6);
                    if (count++ === 20) {
                      client.close(done);
                    }
                  }
                );
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
        // the original regex invalid, and leads to segmentation fault.
        db.createCollection('shouldCorrectlyDoFindMinMax', function (err, collection) {
          collection.insert(
            { _id: 123, name: 'some name', min: 1, max: 10 },
            configuration.writeConcernMax(),
            function (err) {
              expect(err).to.not.exist;

              collection
                .find({ _id: { $in: ['some', 'value', 123] } })
                .project({ _id: 1, max: 1 })
                .toArray(function (err, docs) {
                  expect(err).to.not.exist;
                  test.equal(10, docs[0].max);

                  collection
                    .find(
                      { _id: { $in: ['some', 'value', 123] } },
                      { projection: { _id: 1, max: 1 } }
                    )
                    .toArray(function (err, docs) {
                      expect(err).to.not.exist;
                      test.equal(10, docs[0].max);

                      client.close(done);
                    });
                });
            }
          );
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        // Get the collection
        var collection = db.collection('textSearchWithSort');
        collection.createIndex({ s: 'text' }, function (err) {
          expect(err).to.not.exist;

          collection.insert(
            [{ s: 'spam' }, { s: 'spam eggs and spam' }, { s: 'sausage and eggs' }],
            function (err) {
              expect(err).to.not.exist;

              collection
                .find(
                  { $text: { $search: 'spam' } },
                  { projection: { _id: false, s: true, score: { $meta: 'textScore' } } }
                )
                .sort({ score: { $meta: 'textScore' } })
                .toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal('spam eggs and spam', items[0].s);
                  client.close(done);
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('shouldNotMutateUserOptions');
        var options = { raw: 'TEST' };
        collection.find({}, options);
        expect(options.skip).to.not.exist;
        expect(options.limit).to.not.exist;
        test.equal('TEST', options.raw);
        client.close(done);
      });
    }
  });

  /**
   * Find and modify should allow for a write Concern without failing
   */
  it('should correctly execute a findOneAndUpdateWithAWriteConcern', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('test_find_and_modify_a_document_3', function (err, collection) {
          // Test return new document on change
          collection.insert({ a: 1, b: 2 }, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;

            // Let's modify the document in place
            collection.findOneAndUpdate(
              { a: 1 },
              { $set: { b: 3 } },
              { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true },
              function (err, updated_doc) {
                expect(updated_doc.value.a).to.equal(1);
                expect(updated_doc.value.b).to.equal(3);

                client.close(done);
              }
            );
          });
        });
      });
    }
  });

  /**
   * Test a simple find
   */
  it('should execute query using batchSize of 0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        const collection = db.collection('test_find_simple_batchsize_0');
        // Insert some test documents
        collection.insert(
          [{ a: 2 }, { b: 3 }, { b: 4 }],
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;
            // Ensure correct insertion testing via the cursor and the count function
            collection
              .find()
              .batchSize(-5)
              .toArray(function (err, documents) {
                expect(err).to.not.exist;
                test.equal(3, documents.length);
                // Let's close the db
                client.close(done);
              });
          }
        );
      });
    }
  });

  /**
   * Test a simple find
   */
  it('should execute query using limit of 0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        const collection = db.collection('test_find_simple_limit_0');

        // Insert some test documents
        collection.insert(
          [{ a: 2 }, { b: 3 }, { b: 4 }],
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;
            // Ensure correct insertion testing via the cursor and the count function
            collection
              .find()
              .limit(-5)
              .toArray(function (err, documents) {
                expect(err).to.not.exist;
                test.equal(3, documents.length);

                // Let's close the db
                client.close(done);
              });
          }
        );
      });
    }
  });

  /**
   * Test a simple find
   */
  it('should execute query using $elemMatch', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        const collection = db.collection('elem_match_test');
        // Insert some test documents
        collection.insert(
          [
            { _id: 1, results: [82, 85, 88] },
            { _id: 2, results: [75, 88, 89] }
          ],
          configuration.writeConcernMax(),
          function (err) {
            expect(err).to.not.exist;

            // Ensure correct insertion testing via the cursor and the count function
            collection
              .find({ results: { $elemMatch: { $gte: 80, $lt: 85 } } })
              .toArray(function (err, documents) {
                expect(err).to.not.exist;
                test.deepEqual([{ _id: 1, results: [82, 85, 88] }], documents);

                // Let's close the db
                client.close(done);
              });
          }
        );
      });
    }
  });

  /**
   * Test a simple find
   */
  it('should execute query using limit of 101', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        const collection = db.collection('test_find_simple_limit_101');
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
        collection.insertMany(docs, configuration.writeConcernMax(), function (err, r) {
          expect(err).to.not.exist;
          test.ok(r);

          // Ensure correct insertion testing via the cursor and the count function
          collection
            .find()
            .limit(200)
            .toArray(function (err, documents) {
              expect(err).to.not.exist;
              test.equal(200, documents.length);
              // Let's close the db
              client.close(done);
            });
        });
      });
    }
  });

  /**
   * Test a simple find
   */
  it('Should correctly apply db level options to find cursor', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { ignoreUndefined: true });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_find_simple_cursor_inheritance');

        // Insert some test documents
        collection.insert([{ a: 2 }, { b: 3, c: undefined }], function (err) {
          expect(err).to.not.exist;
          // Ensure correct insertion testing via the cursor and the count function
          var cursor = collection.find({ c: undefined });

          cursor.toArray(function (err, documents) {
            test.equal(2, documents.length);
            // Let's close the db
            client.close(done);
          });
        });
      });
    }
  });

  it('should respect client-level read preference', {
    metadata: { requires: { topology: ['replicaset'] } },

    test: function (done) {
      const config = this.configuration;
      const client = config.newClient({}, { monitorCommands: true, readPreference: 'secondary' });

      client.connect((err, client) => {
        expect(err).to.not.exist;

        let selectedServer;
        const topology = client.topology;
        const selectServerStub = sinon.stub(topology, 'selectServer').callsFake(async function () {
          const args = Array.prototype.slice.call(arguments);
          const server = topology.selectServer.wrappedMethod.apply(this, args);
          selectedServer = await server;
          return selectedServer;
        });

        const collection = client.db().collection('test_read_preference');
        collection.find().toArray(err => {
          expect(err).to.not.exist;
          expect(selectedServer.description.type).to.eql('RSSecondary');

          client.close(err => {
            selectServerStub.restore();
            done(err);
          });
        });
      });
    }
  });

  context('when passed an ObjectId instance as the filter', () => {
    let client;
    let findsStarted;

    beforeEach(function () {
      client = this.configuration.newClient({ monitorCommands: true });
      findsStarted = [];
      client.on('commandStarted', ev => {
        if (ev.commandName === 'find') findsStarted.push(ev.command);
      });
    });

    afterEach(async function () {
      findsStarted = undefined;
      await client.close();
    });

    context('find(oid)', () => {
      it('wraps the objectId in a document with _id as the only key', async () => {
        const collection = client.db('test').collection('test');
        const oid = new ObjectId();
        await collection.find(oid).toArray();
        expect(findsStarted).to.have.lengthOf(1);
        expect(findsStarted[0]).to.have.nested.property('filter._id', oid);
        expect(findsStarted[0].filter).to.have.all.keys('_id');
      });
    });

    context('findOne(oid)', () => {
      it('wraps the objectId in a document with _id as the only key', async () => {
        const collection = client.db('test').collection('test');
        const oid = new ObjectId();
        await collection.findOne(oid);
        expect(findsStarted).to.have.lengthOf(1);
        expect(findsStarted[0]).to.have.nested.property('filter._id', oid);
        expect(findsStarted[0].filter).to.have.all.keys('_id');
      });
    });
  });
});
