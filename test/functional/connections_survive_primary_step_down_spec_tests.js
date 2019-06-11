'use strict';

const chai = require('chai');
const expect = chai.expect;

let client;
describe('Connections survive primary step down', function() {
  beforeEach(function() {
    client = this.configuration.newClient(
      { w: 1 },
      { poolSize: 1, retryWrites: false, useUnifiedTopology: true }
    );
  });

  afterEach(function() {
    return client.close();
  });

  it('getMore iteration', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function(done) {
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db('step-down');

        db.admin().serverStatus((err, result) => {
          expect(err).to.not.exist;
          const numberOfConnections = result.connections.totalCreated;
          db.createCollection('step-down', (err, collection) => {
            expect(err).to.not.exist;
            // Drop the test collection, using writeConcern "majority".
            collection.drop({ w: 'majority' }, err => {
              expect(err).to.not.exist;
              // Execute the "create" command to recreate the collection, using writeConcern "majority".
              db.createCollection('step-down', { w: 'majority' }, (err, coll) => {
                expect(err).to.not.exist;

                // Insert 5 documents into a collection with a majority write concern.
                coll.insertMany(
                  [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }],
                  { w: 'majority' },
                  (err, result) => {
                    expect(err).to.not.exist;
                    expect(result.insertedCount).to.equal(5);
                    // Start a find operation on the collection with a batch size of 2,
                    // and retrieve the first batch of results.
                    coll.find({}, { batchSize: 2 }, (err, cursor) => {
                      expect(err).to.not.exist;

                      // retrieve first batch of results
                      cursor.next(err => {
                        expect(err).to.not.exist;
                        cursor.next(err => {
                          expect(err).to.not.exist;

                          // Send a { replSetStepDown: 5, force: true } command to the current primary
                          // and verify that the command succeeded.
                          db.executeDbAdminCommand(
                            { replSetStepDown: 5, force: true },
                            { readPreference: 'primary' },
                            err => {
                              expect(err).to.not.exist;
                              // Retrieve the next batch of results from the cursor obtained in the find operation,
                              // and verify that this operation succeeded.
                              cursor.next(err => {
                                expect(err).to.not.exist;

                                db.admin().serverStatus((err, result) => {
                                  expect(err).to.not.exist;
                                  expect(result.connections.totalCreated).to.equal(
                                    numberOfConnections
                                  );
                                  client.close(done);
                                });
                              });
                            }
                          );
                        });
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  it('Not Master - Keep Connection Pool', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function(done) {
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db('step-down');

        db.admin().serverStatus((err, result) => {
          expect(err).to.not.exist;
          const numberOfConnections = result.connections.totalCreated;

          db.createCollection('step-down', (err, collection) => {
            expect(err).to.not.exist;
            // Drop the test collection, using writeConcern "majority".
            collection.drop({ w: 'majority' }, err => {
              expect(err).to.not.exist;
              // Execute the "create" command to recreate the collection, using writeConcern "majority".
              db.createCollection('step-down', { w: 'majority' }, (err, coll) => {
                expect(err).to.not.exist;
                //Set the following fail point:
                //{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 10107}}
                db.executeDbAdminCommand(
                  {
                    configureFailPoint: 'failCommand',
                    mode: { times: 1 },
                    data: { failCommands: ['insert'], errorCode: 10107 }
                  },
                  err => {
                    expect(err).to.not.exist;
                    // Execute an insert into the test collection of a {test: 1} document.
                    coll.insertOne({ test: 1 }, err => {
                      // Verify that the insert failed with an operation failure with 10107 code.
                      expect(err.code).to.equal(10107);

                      coll.insertOne({ test: 1 }, (err, result) => {
                        // Verify that the insert failed with an operation failure with 10107 code.
                        expect(err).to.not.exist;
                        // Execute an insert into the test collection of a {test: 1} document and verify that it succeeds.
                        expect(result.insertedCount).to.equal(1);
                        db.executeDbAdminCommand(
                          { configureFailPoint: 'failCommand', mode: 'off' },
                          err => {
                            expect(err).to.not.exist;
                            // Verify that the connection pool has not been cleared
                            db.admin().serverStatus((err, result) => {
                              expect(err).to.not.exist;
                              expect(result.connections.totalCreated).to.equal(numberOfConnections);
                              client.close(done);
                            });
                          }
                        );
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  it('Not Master - Reset Connection Pool', {
    metadata: { requires: { mongodb: '<=4.0.0', topology: 'replicaset' } },
    test: function(done) {
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db('step-down');

        db.admin().serverStatus((err, result) => {
          expect(err).to.not.exist;
          const numberOfConnections = result.connections.totalCreated;
          db.createCollection('step-down', (err, collection) => {
            expect(err).to.not.exist;
            // Drop the test collection, using writeConcern "majority".
            collection.drop({ w: 'majority' }, err => {
              expect(err).to.not.exist;
              // Execute the "create" command to recreate the collection, using writeConcern "majority".
              db.createCollection('step-down', { w: 'majority' }, (err, coll) => {
                expect(err).to.not.exist;
                //Set the following fail point:
                //{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 10107}}
                db.executeDbAdminCommand(
                  {
                    configureFailPoint: 'failCommand',
                    mode: { times: 1 },
                    data: { failCommands: ['insert'], errorCode: 10107 }
                  },
                  err => {
                    expect(err).to.not.exist;
                    // Execute an insert into the test collection of a {test: 1} document.
                    coll.insert({ test: 1 }, err => {
                      // Verify that the insert failed with an operation failure with 10107 code.
                      expect(err.code).to.equal(10107);
                      // Verify that the pool has been cleared
                      db.admin().serverStatus((err, result) => {
                        expect(err).to.not.exist;
                        expect(result.connections.totalCreated).to.equal(numberOfConnections + 1);
                        client.close(done);
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  it('Shutdown in progress - Reset Connection Pool', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function(done) {
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db('step-down');

        db.admin().serverStatus((err, result) => {
          expect(err).to.not.exist;
          const numberOfConnections = result.connections.totalCreated;
          db.createCollection('step-down', (err, collection) => {
            expect(err).to.not.exist;
            // Drop the test collection, using writeConcern "majority".
            collection.drop({ w: 'majority' }, err => {
              expect(err).to.not.exist;
              // Execute the "create" command to recreate the collection, using writeConcern "majority".
              db.createCollection('step-down', { w: 'majority' }, (err, coll) => {
                expect(err).to.not.exist;
                //Set the following fail point: {configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 91}}
                db.executeDbAdminCommand(
                  {
                    configureFailPoint: 'failCommand',
                    mode: { times: 1 },
                    data: { failCommands: ['insert'], errorCode: 91 }
                  },
                  err => {
                    expect(err).to.not.exist;
                    //Execute an insert into the test collection of a {test: 1} document.
                    coll.insertOne({ test: 1 }, err => {
                      // Verify that the insert failed with an operation failure with 91 code.
                      expect(err.code).to.equal(91);
                      //Verify that the pool has been cleared
                      db.admin().serverStatus((err, result) => {
                        expect(err).to.not.exist;
                        expect(result.connections.totalCreated).to.equal(numberOfConnections + 1);
                        client.close(done);
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  it('Interrupted at shutdown - Reset Connection Pool', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function(done) {
      client.connect(err => {
        expect(err).to.not.exist;

        const db = client.db('step-down');

        db.admin().serverStatus((err, result) => {
          expect(err).to.not.exist;
          const numberOfConnections = result.connections.totalCreated;
          db.createCollection('step-down', (err, collection) => {
            expect(err).to.not.exist;
            // Drop the test collection, using writeConcern "majority".
            collection.drop({ w: 'majority' }, err => {
              expect(err).to.not.exist;
              // Execute the "create" command to recreate the collection, using writeConcern "majority".
              db.createCollection('step-down', { w: 'majority' }, (err, coll) => {
                expect(err).to.not.exist;
                //Set the following fail point: {configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 11600}}
                db.executeDbAdminCommand(
                  {
                    configureFailPoint: 'failCommand',
                    mode: { times: 1 },
                    data: { failCommands: ['insert'], errorCode: 11600 }
                  },
                  err => {
                    expect(err).to.not.exist;
                    //Execute an insert into the test collection of a {test: 1} document.
                    coll.insert({ test: 1 }, err => {
                      // Verify that the insert failed with an operation failure with 11600 code.
                      expect(err.code).to.equal(11600);
                      //Verify that the pool has been cleared
                      db.admin().serverStatus((err, result) => {
                        expect(err).to.not.exist;
                        expect(result.connections.totalCreated).to.equal(numberOfConnections + 1);
                        client.close(done);
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });
});
