import { expect } from 'chai';

import { assert as test, setupDatabase } from '../shared';

describe('Document Validation', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should allow bypassing document validation in 3.2 or higher on inserts', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.1.7',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Get collection
        const col = db.collection('createValidationCollection');

        // Drop the collection
        col.drop(function () {
          // Create a collection with a validator
          db.createCollection(
            'createValidationCollection',
            { validator: { a: { $exists: true } } },
            function (err) {
              expect(err).to.not.exist;

              // Ensure validation was correctly applied
              col.insert({ b: 1 }, function (err) {
                test.ok(err != null);

                // Ensure validation was correctly applied
                col.insert({ b: 1 }, { bypassDocumentValidation: true }, function (err) {
                  expect(err).to.not.exist;

                  // Bypass valiation on insert
                  col.insertOne({ b: 1 }, { bypassDocumentValidation: true }, function (err) {
                    expect(err).to.not.exist;

                    // Bypass valiation on insert
                    col.insertMany([{ b: 1 }], { bypassDocumentValidation: true }, function (err) {
                      expect(err).to.not.exist;

                      client.close(done);
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

  it('should allow bypassing document validation in 3.2 or higher on updates', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.1.7',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Get collection
        const col = db.collection('createValidationCollection');

        // Drop the collection
        col.drop(function () {
          // Create a collection with a validator
          db.createCollection(
            'createValidationCollection',
            { validator: { a: { $exists: true } } },
            function (err) {
              expect(err).to.not.exist;

              // Should fail
              col.update({ b: 1 }, { $set: { b: 1 } }, { upsert: true }, function (err) {
                expect(err).to.exist;

                // Ensure validation was correctly applied
                col.update(
                  { b: 1 },
                  { $set: { b: 1 } },
                  { upsert: true, bypassDocumentValidation: true },
                  function (err) {
                    expect(err).to.not.exist;

                    // updateOne
                    col.updateOne(
                      { c: 1 },
                      { $set: { c: 1 } },
                      { upsert: true, bypassDocumentValidation: true },
                      function (err) {
                        expect(err).to.not.exist;

                        // updateMany
                        col.updateMany(
                          { d: 1 },
                          { $set: { d: 1 } },
                          { upsert: true, bypassDocumentValidation: true },
                          function (err) {
                            expect(err).to.not.exist;

                            // updateMany
                            col.replaceOne(
                              { e: 1 },
                              { e: 1 },
                              { upsert: true, bypassDocumentValidation: true },
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
                );
              });
            }
          );
        });
      });
    }
  });

  it('should allow bypassing document validation in 3.2 or higher on bulkWrite', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.1.7',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Get collection
        const col = db.collection('createValidationCollection');

        // Drop the collection
        col.drop(function () {
          // Create a collection with a validator
          db.createCollection(
            'createValidationCollection',
            { validator: { a: { $exists: true } } },
            function (err) {
              expect(err).to.not.exist;

              // Should fail
              col.bulkWrite([{ insertOne: { b: 1 } }], function (err) {
                test.ok(err != null);

                col.bulkWrite(
                  [{ insertOne: { b: 1 } }],
                  { bypassDocumentValidation: true },
                  function (err) {
                    expect(err).to.not.exist;

                    client.close(done);
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  it('should allow bypassing document validation in 3.2 or higher on findAndModify', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.1.7',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Get collection
        const col = db.collection('createValidationCollection');

        // Drop the collection
        col.drop(function () {
          // Create a collection with a validator
          db.createCollection(
            'createValidationCollection',
            { validator: { a: { $exists: true } } },
            function (err) {
              expect(err).to.not.exist;

              // Should fail
              col.findOneAndUpdate({ b: 1 }, { $set: { b: 1 } }, { upsert: true }, function (err) {
                test.ok(err != null);

                // Should pass
                col.findOneAndUpdate(
                  { b: 1 },
                  { $set: { b: 1 } },
                  { upsert: true, bypassDocumentValidation: true },
                  function (err) {
                    expect(err).to.not.exist;

                    // Should pass
                    col.findOneAndReplace(
                      { c: 1 },
                      { c: 1 },
                      { upsert: true, bypassDocumentValidation: true },
                      function (err) {
                        expect(err).to.not.exist;

                        client.close(done);
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

  it('should correctly bypass validation for aggregation using out', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.1.7',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        // Some docs for insertion
        const docs = [
          {
            title: 'this is my title',
            author: 'bob',
            posted: new Date(),
            pageViews: 5,
            tags: ['fun', 'good', 'fun'],
            other: { foo: 5 },
            comments: [
              { author: 'joe', text: 'this is cool' },
              { author: 'sam', text: 'this is bad' }
            ]
          }
        ];

        // Get collection
        const col = db.collection('createValidationCollectionOut');

        // Drop the collection
        col.drop(function () {
          // Create a collection with a validator
          db.createCollection(
            'createValidationCollectionOut',
            { validator: { a: { $exists: true } } },
            function (err) {
              expect(err).to.not.exist;

              // Insert the docs
              col.insertMany(
                docs,
                { writeConcern: { w: 1 }, bypassDocumentValidation: true },
                function (err) {
                  expect(err).to.not.exist;

                  // Execute aggregate, notice the pipeline is expressed as an Array
                  const cursor = col.aggregate(
                    [
                      {
                        $project: {
                          author: 1,
                          tags: 1
                        }
                      },
                      { $unwind: '$tags' },
                      {
                        $group: {
                          _id: { tags: '$tags' },
                          authors: { $addToSet: '$author' }
                        }
                      },
                      { $out: 'createValidationCollectionOut' }
                    ],
                    { bypassDocumentValidation: true }
                  );

                  cursor.toArray(function (err) {
                    expect(err).to.not.exist;

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
