'use strict';

const MongoClient = require('../..').MongoClient;
const path = require('path');
const fs = require('fs');
const expect = require('chai').expect;
const setupDatabase = require('./shared').setupDatabase;
const EJSON = require('mongodb-extjson');

function filterForCommands(commands, bag) {
  commands = Array.isArray(commands) ? commands : [commands];
  return function(event) {
    if (commands.indexOf(event.commandName) !== -1) bag.push(event);
  };
}

function filterOutCommands(commands, bag) {
  commands = Array.isArray(commands) ? commands : [commands];
  return function(event) {
    if (commands.indexOf(event.commandName) === -1) bag.push(event);
  };
}

function ignoreNsNotFound(err) {
  if (!err.message.match(/ns not found/)) throw err;
}

describe('APM', function() {
  before(function() {
    setupDatabase(this.configuration);
  });

  it('should correctly receive the APM events for an insert', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    // The actual test we wish to run
    test: function() {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      client.on('commandStarted', filterForCommands('insert', started));
      client.on('commandSucceeded', filterForCommands('insert', succeeded));

      return client
        .connect()
        .then(client =>
          client
            .db(this.configuration.db)
            .collection('apm_test')
            .insertOne({ a: 1 })
        )
        .then(r => {
          expect(r.insertedCount).to.equal(1);
          expect(started.length).to.equal(1);
          expect(started[0].commandName).to.equal('insert');
          expect(started[0].command.insert).to.equal('apm_test');
          expect(succeeded.length).to.equal(1);
          return client.close();
        });
    }
  });

  it('should correctly handle cursor.close when no cursor existed', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const started = [];
      const succeeded = [];
      const self = this;
      const client = this.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      client.on('commandStarted', filterForCommands('insert', started));
      client.on('commandSucceeded', filterForCommands('insert', succeeded));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);
        const collection = db.collection('apm_test_cursor');
        return collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]).then(r => {
          expect(r.insertedCount).to.equal(3);
          const cursor = collection.find({});
          return cursor.count().then(() => {
            cursor.close(); // <-- Will cause error in APM module.
            return client.close();
          });
        });
      });
    }
  });

  it('should correctly receive the APM events for a listCollections command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const ReadPreference = self.configuration.require.ReadPreference;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      client.on('commandStarted', filterForCommands('listCollections', started));
      client.on('commandSucceeded', filterForCommands('listCollections', succeeded));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);

        return db
          .collection('apm_test_list_collections')
          .insertOne({ a: 1 }, self.configuration.writeConcernMax())
          .then(r => {
            expect(r.insertedCount).to.equal(1);
            return db.listCollections({}, { readPreference: ReadPreference.PRIMARY }).toArray();
          })
          .then(() =>
            db.listCollections({}, { readPreference: ReadPreference.SECONDARY }).toArray()
          )
          .then(() => {
            expect(started).to.have.lengthOf(2);

            // Ensure command was not sent to the primary
            expect(started[0].connectionId).to.not.equal(started[1].connectionId);
            return client.close();
          });
      });
    }
  });

  it('should correctly receive the APM events for a listIndexes command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      const self = this;
      const ReadPreference = self.configuration.require.ReadPreference;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['listIndexes', 'find'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      client.on('fullsetup', client => {
        const db = client.db(self.configuration.db);

        db
          .collection('apm_test_list_collections')
          .insertOne({ a: 1 }, self.configuration.writeConcernMax())
          .then(r => {
            expect(r.insertedCount).to.equal(1);

            return db
              .collection('apm_test_list_collections')
              .listIndexes({ readPreference: ReadPreference.PRIMARY })
              .toArray();
          })
          .then(() =>
            db
              .collection('apm_test_list_collections')
              .listIndexes({ readPreference: ReadPreference.SECONDARY })
              .toArray()
          )
          .then(() => {
            expect(started).to.have.lengthOf(2);

            // Ensure command was not sent to the primary
            expect(started[0].connectionId).to.not.equal(started[1].connectionId);
            client.close();
            done();
          });
      });

      client.connect();
    }
  });

  it.skip(
    'should correctly receive the APM events for an insert using custom operationId and time generator',
    {
      metadata: { requires: { topology: ['single', 'replicaset'] } },

      // The actual test we wish to run
      test: function() {
        const self = this;
        const started = [];
        const succeeded = [];
        const callbackTriggered = false;

        // testListener = require('../..').instrument(
        //   {
        //     operationIdGenerator: {
        //       next: function() {
        //         return 10000;
        //       }
        //     },
        //     timestampGenerator: {
        //       current: function() {
        //         return 1;
        //       },
        //       duration: function(start, end) {
        //         return end - start;
        //       }
        //     }
        //   },
        //   function(err) {
        //     expect(err).to.be.null;
        //     callbackTriggered = true;
        //   }
        // );

        // testListener.on('started', function(event) {
        //   if (event.commandName === 'insert') started.push(event);
        // });

        // testListener.on('succeeded', function(event) {
        //   if (event.commandName === 'insert') succeeded.push(event);
        // });

        const client = self.configuration.newClient(
          { w: 1 },
          { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
        );

        return client.connect().then(client => {
          const db = client.db(self.configuration.db);

          return db
            .collection('apm_test_1')
            .insertOne({ a: 1 })
            .then(() => {
              expect(started).to.have.length(1);
              expect(succeeded).to.have.length(1);
              expect(started[0].commandName).to.equal('insert');
              expect(started[0].command.insert).to.equal('apm_test_1');
              expect(started[0].operationId).to.equal(10000);
              expect(succeeded[0].duration).to.equal(0);
              expect(callbackTriggered).to.be.true;

              // testListener.uninstrument();
              return client.close();
            });
        });
      }
    }
  );

  it('should correctly receive the APM events for a find with getmore and killcursor', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const ReadPreference = self.configuration.require.ReadPreference;
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);

        // Drop the collection
        return db
          .collection('apm_test_2')
          .drop()
          .catch(ignoreNsNotFound)
          .then(() => {
            // Insert test documents
            return db
              .collection('apm_test_2')
              .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 });
          })
          .then(r => {
            expect(r.insertedCount).to.equal(6);

            return db
              .collection('apm_test_2')
              .find({ a: 1 })
              .project({ _id: 1, a: 1 })
              .hint({ _id: 1 })
              .skip(1)
              .limit(100)
              .batchSize(2)
              .comment('some comment')
              .maxScan(1000)
              .maxTimeMS(5000)
              .setReadPreference(ReadPreference.PRIMARY)
              .addCursorFlag('noCursorTimeout', true)
              .toArray();
          })
          .then(docs => {
            // Assert basic documents
            expect(docs).to.have.length(5);
            expect(started).to.have.length(3);
            expect(succeeded).to.have.length(3);
            expect(failed).to.have.length(0);

            // Success messages
            expect(succeeded[0].reply).to.not.be.null;
            expect(succeeded[0].operationId).to.equal(succeeded[1].operationId);
            expect(succeeded[0].operationId).to.equal(succeeded[2].operationId);
            expect(succeeded[1].reply).to.not.be.null;
            expect(succeeded[2].reply).to.not.be.null;

            // Started
            expect(started[0].operationId).to.equal(started[1].operationId);
            expect(started[0].operationId).to.equal(started[2].operationId);

            return client.close();
          });
      });
    }
  });

  it('should correctly receive the APM failure event for find', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=2.6.0' } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const ReadPreference = self.configuration.require.ReadPreference;
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);

        // Drop the collection
        return db
          .collection('apm_test_2')
          .drop()
          .catch(ignoreNsNotFound)
          .then(() => {
            // Insert test documents
            return db
              .collection('apm_test_2')
              .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }]);
          })
          .then(r => {
            expect(r.insertedCount).to.equal(6);
            return db
              .collection('apm_test_2')
              .find({ $illegalfield: 1 })
              .project({ _id: 1, a: 1 })
              .hint({ _id: 1 })
              .skip(1)
              .limit(100)
              .batchSize(2)
              .comment('some comment')
              .maxScan(1000)
              .maxTimeMS(5000)
              .setReadPreference(ReadPreference.PRIMARY)
              .addCursorFlag('noCursorTimeout', true)
              .toArray();
          })
          .then(() => {
            throw new Error('this should not happen');
          })
          .catch(() => {
            expect(failed).to.have.length(1);
            return client.close();
          });
      });
    }
  });

  it('should correctly receive the APM events for a bulk operation', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['insert', 'update', 'delete'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);
        return db
          .collection('apm_test_3')
          .bulkWrite(
            [
              { insertOne: { a: 1 } },
              { updateOne: { q: { a: 2 }, u: { $set: { a: 2 } }, upsert: true } },
              { deleteOne: { q: { c: 1 } } }
            ],
            { ordered: true }
          )
          .then(() => {
            expect(started).to.have.length(3);
            expect(succeeded).to.have.length(3);
            expect(started[0].operationId).to.equal(started[1].operationId);
            expect(started[0].operationId).to.equal(started[2].operationId);
            expect(succeeded[0].operationId).to.equal(succeeded[1].operationId);
            expect(succeeded[0].operationId).to.equal(succeeded[2].operationId);
            return client.close();
          });
      });
    }
  });

  it('should correctly receive the APM explain command', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors', 'explain'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);

        return db
          .collection('apm_test_2')
          .drop()
          .catch(ignoreNsNotFound)
          .then(() =>
            db
              .collection('apm_test_2')
              .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 })
          )
          .then(r => {
            expect(r.insertedCount).to.equal(6);
            return db
              .collection('apm_test_2')
              .find({ a: 1 })
              .explain();
          })
          .then(explain => {
            expect(explain).to.not.be.null;
            expect(started).to.have.length(1);
            expect(started[0].commandName).to.equal('explain');
            expect(started[0].command.explain.find).to.equal('apm_test_2');
            expect(succeeded).to.have.length(1);
            expect(succeeded[0].commandName).to.equal('explain');
            expect(started[0].operationId).to.equal(succeeded[0].operationId);
            return client.close();
          });
      });
    }
  });

  it('should correctly filter out sensitive commands', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['getnonce'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      return client
        .connect()
        .then(client => client.db(self.configuration.db).command({ getnonce: true }))
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(succeeded).to.have.length(1);
          expect(failed).to.have.length(0);
          expect(started[0].commandObj).to.eql({ getnonce: true });
          expect(succeeded[0].reply).to.eql({});
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for an updateOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['update'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .connect()
        .then(client =>
          client
            .db(self.configuration.db)
            .collection('apm_test_u_1')
            .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
        )
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('update');
          expect(started[0].command.update).to.equal('apm_test_u_1');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for an updateMany', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['update'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .connect()
        .then(client =>
          client
            .db(self.configuration.db)
            .collection('apm_test_u_2')
            .updateMany({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
        )
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('update');
          expect(started[0].command.update).to.equal('apm_test_u_2');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for deleteOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['delete'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .connect()
        .then(client =>
          client
            .db(self.configuration.db)
            .collection('apm_test_u_3')
            .deleteOne({ a: 1 })
        )
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('delete');
          expect(started[0].command.delete).to.equal('apm_test_u_3');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should ensure killcursor commands are sent on 3.0 or earlier when APM is enabled', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '<=3.0.x' } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);
        const admindb = db.admin();
        let cursorCountBefore;
        let cursorCountAfter;

        const collection = db.collection('apm_killcursor_tests');

        // make sure collection has records (more than 2)
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }])
          .then(r => {
            expect(r).to.exist;
            return admindb.serverStatus();
          })
          .then(result => {
            cursorCountBefore = result.cursors.clientCursors_size;
            let cursor = collection.find({}).limit(2);
            return cursor.toArray().then(r => {
              expect(r).to.exist;
              return cursor.close();
            });
          })
          .then(() => admindb.serverStatus())
          .then(result => {
            cursorCountAfter = result.cursors.clientCursors_size;
            expect(cursorCountBefore).to.equal(cursorCountAfter);
            return client.close();
          });
      });
    }
  });

  it('should correcly decorate the apm result for aggregation with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];

      // Generate docs
      const docs = [];
      for (let i = 0; i < 2500; i++) docs.push({ a: i });

      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['aggregate', 'getMore'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client.connect().then(() => {
        const db = client.db(self.configuration.db);
        return db
          .collection('apm_test_u_4')
          .drop()
          .catch(ignoreNsNotFound)
          .then(() => db.collection('apm_test_u_4').insertMany(docs))
          .then(r => {
            expect(r).to.exist;
            return db
              .collection('apm_test_u_4')
              .aggregate([{ $match: {} }])
              .toArray();
          })
          .then(r => {
            expect(r).to.exist;
            expect(started).to.have.length(3);
            expect(succeeded).to.have.length(3);
            const cursors = succeeded.map(x => x.reply.cursor);

            // Check we have a cursor
            expect(cursors[0].id).to.exist;
            expect(cursors[0].id.toString()).to.equal(cursors[1].id.toString());
            expect(cursors[2].id.toString()).to.equal('0');

            return client.close();
          });
      });
    }
  });

  it('should correcly decorate the apm result for listCollections with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },
    test: function() {
      const self = this;
      const started = [];
      const succeeded = [];
      const client = self.configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: false, enableCommandMonitoring: true }
      );

      const desiredEvents = ['listCollections'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client.connect().then(client => {
        const db = client.db(self.configuration.db);

        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(db.collection('_mass_collection_' + i).insertOne({ a: 1 }));
        }

        return Promise.all(promises)
          .then(r => {
            expect(r).to.exist;

            return db
              .listCollections()
              .batchSize(10)
              .toArray();
          })
          .then(r => {
            expect(r).to.exist;
            expect(started).to.have.length(1);
            expect(succeeded).to.have.length(1);

            const cursors = succeeded.map(x => x.reply.cursor);
            expect(cursors[0].id).to.exist;

            return client.close();
          });
      });
    }
  });

  describe('spec tests', function() {
    before(function() {
      setupDatabase(this.configuration);
    });

    function validateExpecations(expectation, results) {
      let obj, databaseName, commandName, reply, result;
      if (expectation.command_started_event) {
        // Get the command
        obj = expectation.command_started_event;
        // Unpack the expectation
        const command = obj.command;
        databaseName = obj.database_name;
        commandName = obj.command_name;

        // Get the result
        result = results.starts.shift();

        // Validate the test
        expect(result.commandName).to.equal(commandName);
        expect(result.databaseName).to.equal(databaseName);

        // strip sessions data
        delete result.command.lsid;

        // Do we have a getMore command or killCursor command
        if (commandName === 'getMore') {
          expect(result.command.getMore.isZero()).to.be.false;
        } else if (commandName === 'killCursors') {
          // eslint-disable-line
        } else {
          expect(result.command).to.deep.include(command);
        }
      } else if (expectation.command_succeeded_event) {
        obj = expectation.command_succeeded_event;
        // Unpack the expectation
        reply = obj.reply;
        databaseName = obj.database_name;
        commandName = obj.command_name;

        // Get the result
        result = results.successes.shift();

        if (result.commandName === 'endSessions') {
          result = results.successes.shift();
        }

        // Validate the test
        expect(result.commandName).to.equal(commandName);
        // Do we have a getMore command
        if (commandName.toLowerCase() === 'getmore' || commandName.toLowerCase() === 'find') {
          reply.cursor.id = result.reply.cursor.id;
          expect(result.reply).to.deep.include(reply);
        }
      } else if (expectation.command_failed_event) {
        obj = expectation.command_failed_event;
        // Unpack the expectation
        reply = obj.reply;
        databaseName = obj.database_name;
        commandName = obj.command_name;

        // Get the result
        results.failures = results.failures;
        result = results.failures.shift();

        // Validate the test
        expect(result.commandName).to.equal(commandName);
      }
    }

    function executeOperation(client, scenario, test) {
      // Get the operation
      const operation = test.operation;
      // Get the command name
      const commandName = operation.name;
      // Get the arguments
      const args = operation.arguments || {};
      // Get the database instance
      const db = client.db(scenario.database_name);
      // Get the collection
      const collection = db.collection(scenario.collection_name);
      // Parameters
      const params = [];
      // Options
      let options = null;
      // Get the data
      const data = scenario.data;
      // Command Monitoring context
      const monitoringResults = {
        successes: [],
        failures: [],
        starts: []
      };

      // Drop the collection
      return collection
        .drop()
        .catch(err => {
          // potentially skip this error
          if (!err.message.match(/ns not found/)) throw err;
        })
        .then(() => collection.insertMany(data))
        .then(r => {
          expect(data).to.have.length(r.insertedCount);

          // Set up the listeners
          client.on('commandStarted', filterOutCommands('endSessions', monitoringResults.starts));
          client.on('commandFailed', filterOutCommands('endSessions', monitoringResults.failures));
          client.on(
            'commandSucceeded',
            filterOutCommands('endSessions', monitoringResults.successes)
          );

          // Unpack the operation
          if (args.filter) params.push(args.filter);
          if (args.deletes) params.push(args.deletes);
          if (args.document) params.push(args.document);
          if (args.documents) params.push(args.documents);
          if (args.update) params.push(args.update);
          if (args.requests) params.push(args.requests);

          if (args.writeConcern) {
            if (options == null) {
              options = args.writeConcern;
            } else {
              for (let name in args.writeConcern) {
                options[name] = args.writeConcern[name];
              }
            }
          }

          if (typeof args.ordered === 'boolean') {
            if (options == null) {
              options = { ordered: args.ordered };
            } else {
              options.ordered = args.ordered;
            }
          }

          if (typeof args.upsert === 'boolean') {
            if (options == null) {
              options = { upsert: args.upsert };
            } else {
              options.upsert = args.upsert;
            }
          }

          // Find command is special needs to executed using toArray
          if (operation.name === 'find') {
            let cursor = collection[commandName]();

            // Set the options
            if (args.filter) cursor = cursor.filter(args.filter);
            if (args.batchSize) cursor = cursor.batchSize(args.batchSize);
            if (args.limit) cursor = cursor.limit(args.limit);
            if (args.skip) cursor = cursor.skip(args.skip);
            if (args.sort) cursor = cursor.sort(args.sort);

            // Set any modifiers
            if (args.modifiers) {
              for (let modifier in args.modifiers) {
                cursor.addQueryModifier(modifier, args.modifiers[modifier]);
              }
            }

            // Execute find
            return cursor
              .toArray()
              .catch(() => {} /* ignore */)
              .then(() =>
                test.expectations.forEach(expectation =>
                  validateExpecations(expectation, monitoringResults)
                )
              );
          }

          // Add options if they exists
          if (options) params.push(options);

          // Execute the operation
          const promise = collection[commandName].apply(collection, params);
          return promise
            .catch(() => {} /* ignore */)
            .then(() =>
              test.expectations.forEach(expectation =>
                validateExpecations(expectation, monitoringResults)
              )
            );
        });
    }

    fs
      .readdirSync(__dirname + '/spec/apm')
      .filter(x => x.indexOf('.json') !== -1)
      .map(x =>
        Object.assign(
          { title: path.basename(x, '.json') },
          EJSON.parse(fs.readFileSync(__dirname + '/spec/apm/' + x), { relaxed: true })
        )
      )
      .forEach(scenario => {
        describe(scenario.title, function() {
          scenario.tests.forEach(test => {
            const requirements = { topology: ['single', 'replicaset', 'sharded'] };
            if (test.ignore_if_server_version_greater_than) {
              requirements.mongodb = `>${scenario.ignore_if_server_version_greater_than}`;
            }

            it(test.description, {
              metadata: { requires: requirements },
              test: function() {
                return MongoClient.connect(this.configuration.url(), {
                  enableCommandMonitoring: true
                }).then(client => {
                  expect(client).to.exist;
                  return executeOperation(client, scenario, test).then(() => client.close());
                });
              }
            });
          });
        });
      });
  });
});
