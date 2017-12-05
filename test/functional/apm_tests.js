'use strict';

var path = require('path'),
  fs = require('fs'),
  expect = require('chai').expect,
  setupDatabase = require('./shared').setupDatabase;

describe('APM', function() {
  let testListener = undefined;
  before(function() {
    return setupDatabase(this.configuration);
  });

  afterEach(function() {
    if (testListener) {
      testListener.uninstrument();
      testListener = undefined;
    }
  });

  it('should correctly receive the APM events for an insert', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var started = [];
      var succeeded = [];
      var callbackTriggered = false;
      var self = this;

      var listener = require('../..').instrument(function(err) {
        expect(err).to.be.null;
        callbackTriggered = true;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'insert') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'insert') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        db
          .collection('apm_test')
          .insertOne({ a: 1 })
          .then(function(r) {
            expect(r.insertedCount).to.equal(1);
            expect(started.length).to.equal(1);
            expect(started[0].commandName).to.equal('insert');
            expect(started[0].command.insert).to.equal('apm_test');
            expect(succeeded.length).to.equal(1);
            expect(callbackTriggered).to.be.true;

            listener.uninstrument();
            client.close();
            done();
          });
      });
    }
  });

  it('should correctly handle cursor.close when no cursor existed', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var started = [];
      var succeeded = [];
      var callbackTriggered = false;
      var self = this;

      var listener = require('../..').instrument(function(err) {
        expect(err).to.be.null;
        callbackTriggered = true;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'insert') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'insert') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(self.configuration.db);
        var collection = db.collection('apm_test_cursor');
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]).then(function(r) {
          expect(r.insertedCount).to.equal(3);
          expect(callbackTriggered).to.be.true;

          var cursor = collection.find({});
          cursor.count(function(err) {
            expect(err).to.be.null;
            cursor.close(); // <-- Will cause error in APM module.

            listener.uninstrument();
            client.close();
            done();
          });
        });
      });
    }
  });

  it.skip('should correctly receive the APM events for a listCollections command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ReadPreference = self.configuration.require.ReadPreference;
      var started = [];
      var succeeded = [];

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        expect(err).to.be.null;
        var db = client.db(self.configuration.db);

        db
          .collection('apm_test_list_collections')
          .insertOne({ a: 1 }, self.configuration.writeConcernMax())
          .then(function(r) {
            expect(r.insertedCount).to.equal(1);

            testListener = require('../..').instrument(function(err) {
              expect(err).to.be.null;
            });

            var listener = testListener;

            listener.on('started', function(event) {
              if (event.commandName === 'listCollections' || event.commandName === 'find') {
                started.push(event);
              }
            });

            listener.on('succeeded', function(event) {
              if (event.commandName === 'listCollections' || event.commandName === 'find') {
                succeeded.push(event);
              }
            });

            db
              .listCollections({}, { readPreference: ReadPreference.PRIMARY })
              .toArray(function(err) {
                expect(err).to.be.null;

                db
                  .listCollections({}, { readPreference: ReadPreference.SECONDARY })
                  .toArray(function(err) {
                    expect(err).to.be.null;
                    // Ensure command was not sent to the primary
                    expect(started[0].connectionId.port).to.not.equal(started[1].connectionId.port);

                    client.close();
                    done();
                  });
              });
          });
      });
    }
  });

  it('should correctly receive the APM events for a listIndexes command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ReadPreference = self.configuration.require.ReadPreference;
      var started = [];
      var succeeded = [];

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.on('fullsetup', function(client) {
        var db = client.db(self.configuration.db);

        db
          .collection('apm_test_list_collections')
          .insertOne({ a: 1 }, self.configuration.writeConcernMax())
          .then(function(r) {
            expect(r.insertedCount).to.equal(1);

            var listener = require('../..').instrument(function(err) {
              expect(err).to.be.null;
            });

            listener.on('started', function(event) {
              if (event.commandName === 'listIndexes' || event.commandName === 'find') {
                started.push(event);
              }
            });

            listener.on('succeeded', function(event) {
              if (event.commandName === 'listIndexes' || event.commandName === 'find') {
                succeeded.push(event);
              }
            });

            db
              .collection('apm_test_list_collections')
              .listIndexes({ readPreference: ReadPreference.PRIMARY })
              .toArray(function(err) {
                expect(err).to.be.null;

                db
                  .collection('apm_test_list_collections')
                  .listIndexes({ readPreference: ReadPreference.SECONDARY })
                  .toArray(function(err) {
                    expect(err).to.be.null;

                    // Ensure command was not sent to the primary
                    expect(started[0].connectionId.port).to.not.equal(started[1].connectionId.port);

                    listener.uninstrument();
                    client.close();
                    done();
                  });
              });
          });
      });

      client.connect(function() {});
    }
  });

  it(
    'should correctly receive the APM events for an insert using custom operationId and time generator',
    {
      metadata: { requires: { topology: ['single', 'replicaset'] } },

      // The actual test we wish to run
      test: function(done) {
        var self = this;
        var started = [];
        var succeeded = [];
        var callbackTriggered = false;

        var listener = require('../..').instrument(
          {
            operationIdGenerator: {
              next: function() {
                return 10000;
              }
            },
            timestampGenerator: {
              current: function() {
                return 1;
              },
              duration: function(start, end) {
                return end - start;
              }
            }
          },
          function(err) {
            expect(err).to.be.null;
            callbackTriggered = true;
          }
        );

        listener.on('started', function(event) {
          if (event.commandName === 'insert') started.push(event);
        });

        listener.on('succeeded', function(event) {
          if (event.commandName === 'insert') succeeded.push(event);
        });

        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);

          db
            .collection('apm_test_1')
            .insertOne({ a: 1 })
            .then(function() {
              expect(started).to.have.length(1);
              expect(succeeded).to.have.length(1);
              expect(started[0].commandName).to.equal('insert');
              expect(started[0].command.insert).to.equal('apm_test_1');
              expect(started[0].operationId).to.equal(10000);
              expect(succeeded[0].duration).to.equal(0);
              expect(callbackTriggered).to.be.true;

              listener.uninstrument();
              client.close();
              done();
            });
        });
      }
    }
  );

  it('should correctly receive the APM events for a find with getmore and killcursor', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ReadPreference = self.configuration.require.ReadPreference;
      var started = [];
      var succeeded = [];
      var failed = [];

      var listener = require('../..').instrument();
      listener.on('started', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          succeeded.push(event);
      });

      listener.on('failed', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          failed.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        // Drop the collection
        db.collection('apm_test_2').drop(function() {
          // Insert test documents
          db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 })
            .then(function(r) {
              expect(r.insertedCount).to.equal(6);

              db
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
                .toArray()
                .then(function(docs) {
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

                  listener.uninstrument();
                  client.close();
                  done();
                })
                .catch(function(err) {
                  done(err);
                });
            })
            .catch(function(e) {
              done(e);
            });
        });
      });
    }
  });

  it('should correctly receive the APM failure event for find', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=2.6.0' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ReadPreference = self.configuration.require.ReadPreference;
      var started = [];
      var succeeded = [];
      var failed = [];

      var listener = require('../..').instrument();
      listener.on('started', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          succeeded.push(event);
      });

      listener.on('failed', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors'
        )
          failed.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        // Drop the collection
        db.collection('apm_test_2').drop(function() {
          // Insert test documents
          db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }])
            .then(function(r) {
              expect(r.insertedCount).to.equal(6);

              db
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
                .toArray()
                .then(function() {})
                .catch(function() {
                  expect(failed).to.have.length(1);

                  listener.uninstrument();
                  client.close();
                  done();
                });
            })
            .catch(function(e) {
              done(e);
            });
        });
      });
    }
  });

  it('should correctly receive the APM events for a bulk operation', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument();
      listener.on('started', function(event) {
        if (
          event.commandName === 'insert' ||
          event.commandName === 'update' ||
          event.commandName === 'delete'
        )
          started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (
          event.commandName === 'insert' ||
          event.commandName === 'update' ||
          event.commandName === 'delete'
        )
          succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        db
          .collection('apm_test_3')
          .bulkWrite(
            [
              { insertOne: { a: 1 } },
              { updateOne: { q: { a: 2 }, u: { $set: { a: 2 } }, upsert: true } },
              { deleteOne: { q: { c: 1 } } }
            ],
            { ordered: true }
          )
          .then(function() {
            expect(started).to.have.length(3);
            expect(succeeded).to.have.length(3);
            expect(started[0].operationId).to.equal(started[1].operationId);
            expect(started[0].operationId).to.equal(started[2].operationId);
            expect(succeeded[0].operationId).to.equal(succeeded[1].operationId);
            expect(succeeded[0].operationId).to.equal(succeeded[2].operationId);

            listener.uninstrument();
            client.close();
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    }
  });

  it('should correctly receive the APM explain command', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];
      var failed = [];

      var listener = require('../..').instrument();
      listener.on('started', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors' ||
          event.commandName === 'explain'
        )
          started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors' ||
          event.commandName === 'explain'
        )
          succeeded.push(event);
      });

      listener.on('failed', function(event) {
        if (
          event.commandName === 'find' ||
          event.commandName === 'getMore' ||
          event.commandName === 'killCursors' ||
          event.commandName === 'explain'
        )
          failed.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        // Drop the collection
        db.collection('apm_test_2').drop(function() {
          // Insert test documents
          db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 })
            .then(function(r) {
              expect(r.insertedCount).to.equal(6);

              db
                .collection('apm_test_2')
                .find({ a: 1 })
                .explain()
                .then(function(explain) {
                  expect(explain).to.not.be.null;

                  expect(started).to.have.length(1);
                  expect(started[0].commandName).to.equal('explain');
                  expect(started[0].command.explain.find).to.equal('apm_test_2');
                  expect(succeeded).to.have.length(1);
                  expect(succeeded[0].commandName).to.equal('explain');

                  // Started
                  expect(started[0].operationId).to.equal(succeeded[0].operationId);

                  // Remove instrumentation
                  listener.uninstrument();
                  client.close();
                  done();
                })
                .catch(function(err) {
                  done(err);
                });
            })
            .catch(function(e) {
              done(e);
            });
        });
      });
    }
  });

  it('should correctly filter out sensitive commands', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];
      var failed = [];

      var listener = require('../..').instrument();
      listener.on('started', function(event) {
        if (event.commandName === 'getnonce') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'getnonce') succeeded.push(event);
      });

      listener.on('failed', function(event) {
        if (event.commandName === 'getnonce') failed.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        db.command({ getnonce: true }, function(err, r) {
          expect(err).to.be.null;
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(succeeded).to.have.length(1);
          expect(failed).to.have.length(0);

          expect(started[0].commandObj).to.eql({ getnonce: true });
          expect(succeeded[0].reply).to.eql({});

          // Remove instrumentation
          listener.uninstrument();
          client.close();
          done();
        });
      });
    }
  });

  it('should correctly receive the APM events for an updateOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'update') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'update') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        db
          .collection('apm_test_u_1')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function(r) {
            expect(r).to.exist;
            expect(started).to.have.length(1);
            expect(started[0].commandName).to.equal('update');
            expect(started[0].command.update).to.equal('apm_test_u_1');
            expect(succeeded).to.have.length(1);

            listener.uninstrument();
            client.close();
            done();
          });
      });
    }
  });

  it('should correctly receive the APM events for an updateMany', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'update') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'update') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        db
          .collection('apm_test_u_2')
          .updateMany({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function(r) {
            expect(r).to.exist;
            expect(started).to.have.length(1);
            expect(started[0].commandName).to.equal('update');
            expect(started[0].command.update).to.equal('apm_test_u_2');
            expect(succeeded).to.have.length(1);

            listener.uninstrument();
            client.close();
            done();
          });
      });
    }
  });

  it('should correctly receive the APM events for deleteOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'delete') started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'delete') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        db
          .collection('apm_test_u_3')
          .deleteOne({ a: 1 })
          .then(function(r) {
            expect(r).to.exist;
            expect(started).to.have.length(1);
            expect(started[0].commandName).to.equal('delete');
            expect(started[0].command.delete).to.equal('apm_test_u_3');
            expect(succeeded).to.have.length(1);

            listener.uninstrument();
            client.close();
            done();
          });
      });
    }
  });

  it('should ensure killcursor commands are sent on 3.0 or earlier when APM is enabled', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '<=3.0.x' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      testListener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var admindb = db.admin();
        var cursorCountBefore;
        var cursorCountAfter;

        var collection = db.collection('apm_killcursor_tests');

        // make sure collection has records (more than 2)
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], function(err, r) {
          expect(r).to.exist;
          expect(err).to.be.null;

          admindb.serverStatus(function(err, result) {
            expect(err).to.be.null;

            cursorCountBefore = result.cursors.clientCursors_size;

            var cursor = collection.find({}).limit(2);
            cursor.toArray(function(err, r) {
              expect(r).to.exist;
              expect(err).to.be.null;
              cursor.close();

              admindb.serverStatus(function(err, result) {
                expect(err).to.be.null;

                cursorCountAfter = result.cursors.clientCursors_size;
                expect(cursorCountBefore).to.equal(cursorCountAfter);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  it('should correcly decorate the apm result for aggregation with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function() {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'aggregate' || event.commandName === 'getMore')
          started.push(event);
      });

      listener.on('succeeded', function(event) {
        if (event.commandName === 'aggregate' || event.commandName === 'getMore')
          succeeded.push(event);
      });

      // Generate docs
      var docs = [];
      for (var i = 0; i < 2500; i++) {
        docs.push({ a: i });
      }

      var db;
      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      return client
        .connect()
        .then(function() {
          db = client.db(self.configuration.db);
          return db
            .collection('apm_test_u_4')
            .drop()
            .catch(function() {});
        })
        .then(function() {
          return db.collection('apm_test_u_4').insertMany(docs);
        })
        .then(function(r) {
          expect(r).to.exist;
          return db
            .collection('apm_test_u_4')
            .aggregate([{ $match: {} }])
            .toArray();
        })
        .then(function(r) {
          expect(r).to.exist;
          expect(started).to.have.length(3);
          expect(succeeded).to.have.length(3);

          var cursors = succeeded.map(function(x) {
            return x.reply.cursor;
          });

          // Check we have a cursor
          expect(cursors[0].id).to.exist;
          expect(cursors[0].id.toString()).to.equal(cursors[1].id.toString());
          expect(cursors[2].id.toString()).to.equal('0');

          listener.uninstrument();
          client.close();
        });
    }
  });

  it('should correcly decorate the apm result for listCollections with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var started = [];
      var succeeded = [];

      var listener = require('../..').instrument(function(err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function(event) {
        if (event.commandName === 'listCollections') started.push(event);
      });

      listener.on('succeeded', function(event) {
        // console.dir(event.commandName)
        if (event.commandName === 'listCollections') succeeded.push(event);
      });

      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.be.null;

        var promises = [];

        for (var i = 0; i < 20; i++) {
          promises.push(db.collection('_mass_collection_' + i).insertOne({ a: 1 }));
        }

        Promise.all(promises).then(function(r) {
          expect(r).to.exist;

          db
            .listCollections()
            .batchSize(10)
            .toArray()
            .then(function(r) {
              expect(r).to.exist;
              expect(started).to.have.length(1);
              expect(succeeded).to.have.length(1);

              var cursors = succeeded.map(function(x) {
                return x.reply.cursor;
              });

              // Check we have a cursor
              expect(cursors[0].id).to.exist;

              listener.uninstrument();
              client.close();
              done();
            });
        });
      });
    }
  });

  describe('spec tests', function() {
    before(function() {
      return setupDatabase(this.configuration);
    });

    var filterSessionsCommands = x => x.filter(y => y.commandName !== 'endSessions');
    var validateExpecations = function(expectation, results) {
      var obj, databaseName, commandName, reply, result;
      if (expectation.command_started_event) {
        // Get the command
        obj = expectation.command_started_event;
        // Unpack the expectation
        var command = obj.command;
        databaseName = obj.database_name;
        commandName = obj.command_name;

        // Get the result
        result = results.starts.shift();

        // Validate the test
        expect(commandName).to.equal(result.commandName);
        expect(databaseName).to.equal(result.databaseName);

        // Do we have a getMore command or killCursor command
        if (commandName === 'getMore') {
          expect(result.command.getMore.isZero()).to.be.false;
        } else if (commandName === 'killCursors') {
          // eslint-disable-line
        } else {
          expect(command).to.eql(result.command);
        }
      } else if (expectation.command_succeeded_event) {
        obj = expectation.command_succeeded_event;
        // Unpack the expectation
        reply = obj.reply;
        databaseName = obj.database_name;
        commandName = obj.command_name;

        // Get the result
        result = results.successes.shift();

        // Validate the test
        expect(commandName).to.equal(result.commandName);
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
        results.failures = filterSessionsCommands(results.failures);
        result = results.failures.shift();

        // Validate the test
        expect(commandName).to.equal(result.commandName);
      }
    };

    var executeOperation = function(client, listener, scenario, test, callback) {
      var successes = [];
      var failures = [];
      var starts = [];

      // Get the operation
      var operation = test.operation;
      // Get the command name
      var commandName = operation.name;
      // Get the arguments
      var args = operation.arguments || {};
      // Get the database instance
      var db = client.db(scenario.database_name);
      // Get the collection
      var collection = db.collection(scenario.collection_name);
      // Parameters
      var params = [];
      // Options
      var options = null;
      // Get the data
      var data = scenario.data;

      // Drop the collection
      collection.drop(function() {
        // No need to check for error, in case the collection doesn't exist already

        // Insert the data
        collection.insertMany(data, function(err, r) {
          expect(err).to.be.null;
          expect(data).to.have.length(r.insertedCount);

          // Set up the listeners
          listener.on('started', function(event) {
            starts.push(event);
          });

          listener.on('succeeded', function(event) {
            successes.push(event);
          });

          listener.on('failed', function(event) {
            failures.push(event);
          });

          // Cleanup the listeners
          var cleanUpListeners = function(_listener) {
            _listener.removeAllListeners('started');
            _listener.removeAllListeners('succeeded');
            _listener.removeAllListeners('failed');
          };

          // Unpack the operation
          if (args.filter) {
            params.push(args.filter);
          }

          if (args.deletes) {
            params.push(args.deletes);
          }

          if (args.document) {
            params.push(args.document);
          }

          if (args.documents) {
            params.push(args.documents);
          }

          if (args.update) {
            params.push(args.update);
          }

          if (args.requests) {
            params.push(args.requests);
          }

          if (args.writeConcern) {
            if (options == null) {
              options = args.writeConcern;
            } else {
              for (var name in args.writeConcern) {
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
            var cursor = collection[commandName]();

            // Set the options
            if (args.filter) cursor = cursor.filter(args.filter);
            if (args.batchSize) cursor = cursor.batchSize(args.batchSize);
            if (args.limit) cursor = cursor.limit(args.limit);
            if (args.skip) cursor = cursor.skip(args.skip);
            if (args.sort) cursor = cursor.sort(args.sort);

            // Set any modifiers
            if (args.modifiers) {
              for (var modifier in args.modifiers) {
                cursor.addQueryModifier(modifier, args.modifiers[modifier]);
              }
            }

            // Execute find
            cursor.toArray(function() {
              // Validate the expectations
              test.expectations.forEach(function(x) {
                validateExpecations(x, {
                  successes: successes,
                  failures: failures,
                  starts: starts
                });
              });

              // Cleanup listeners
              cleanUpListeners(listener);

              // Finish the operation
              callback();
            });
          } else {
            // Add options if they exists
            if (options) params.push(options);
            // Add callback function
            params.push(function() {
              // Validate the expectations
              test.expectations.forEach(function(x) {
                validateExpecations(x, {
                  successes: successes,
                  failures: failures,
                  starts: starts
                });
              });

              // Cleanup listeners
              cleanUpListeners(listener);

              // Finish the operation
              callback();
            });

            // Execute the operation
            collection[commandName].apply(collection, params);
          }
        });
      });
    };

    var scenarios = fs
      .readdirSync(__dirname + '/spec/apm')
      .filter(x => x.indexOf('.json') !== -1)
      .map(function(x) {
        var r = null;

        try {
          r = JSON.parse(fs.readFileSync(__dirname + '/spec/apm/' + x));
        } catch (err) {
          console.dir(err);
        }

        r.title = path.basename(x, '.json');
        return r;
      });

    scenarios.forEach(scenario => {
      describe(scenario.title, function() {
        scenario.tests.forEach(test => {
          it(test.description, function(done) {
            var MongoClient = require('../..');
            var listener = require('../../').instrument();

            MongoClient.connect(this.configuration.url(), function(err, client) {
              expect(err).to.not.exist;
              expect(client).to.exist;

              executeOperation(client, listener, scenario, test, err => {
                expect(err).to.not.exist;

                listener.uninstrument();
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
