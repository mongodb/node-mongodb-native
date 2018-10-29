'use strict';
var assert = require('assert');
var Transform = require('stream').Transform;
var MongoNetworkError = require('mongodb-core').MongoNetworkError;
var setupDatabase = require('./shared').setupDatabase;
var delay = require('./shared').delay;
var co = require('co');
var mock = require('mongodb-mock-server');
const chai = require('chai');
const expect = chai.expect;

chai.use(require('chai-subset'));

// Define the pipeline processing changes
var pipeline = [
  { $addFields: { addedField: 'This is a field added using $addFields' } },
  { $project: { documentKey: false } },
  { $addFields: { comment: 'The documentKey field has been projected out of this document.' } }
];

describe('Change Streams', function() {
  before(function() {
    return setupDatabase(this.configuration, ['integration_tests']);
  });

  beforeEach(function() {
    const configuration = this.configuration;
    const client = configuration.newClient();

    return client.connect().then(() => {
      const db = client.db('integration_tests');
      return db.createCollection('test');
    });
  });

  it('Should create a Change Stream on a collection and emit `change` events', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);
        var collection = client.db('integration_tests').collection('docsDataEvent');
        var changeStream = collection.watch(pipeline);

        let count = 0;

        // Attach first event listener
        changeStream.on('change', function(change) {
          if (count === 0) {
            count += 1;
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.d, 4);
            assert.equal(change.ns.db, 'integration_tests');
            assert.equal(change.ns.coll, 'docsDataEvent');
            assert.ok(!change.documentKey);
            assert.equal(
              change.comment,
              'The documentKey field has been projected out of this document.'
            );
            return;
          }

          assert.equal(change.operationType, 'update');
          assert.equal(change.updateDescription.updatedFields.d, 6);

          // Close the change stream
          changeStream.close(err => client.close(cerr => done(err || cerr)));
        });

        setTimeout(() => {
          // Trigger the first database event
          collection.insert({ d: 4 }, function(err) {
            assert.ifError(err);
            // Trigger the second database event
            collection.update({ d: 4 }, { $inc: { d: 2 } }, function(err) {
              assert.ifError(err);
            });
          });
        });
      });
    }
  });

  it(
    'Should create a Change Stream on a collection and get change events through imperative callback form',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        const client = configuration.newClient();

        client.connect(function(err, client) {
          assert.ifError(err);

          var collection = client.db('integration_tests').collection('docsCallback');
          var changeStream = collection.watch(pipeline);

          // Fetch the change notification
          changeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            changeStream.next(function(err, change) {
              assert.ifError(err);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.fullDocument.e, 5);
              assert.equal(change.ns.db, 'integration_tests');
              assert.equal(change.ns.coll, 'docsCallback');
              assert.ok(!change.documentKey);
              assert.equal(
                change.comment,
                'The documentKey field has been projected out of this document.'
              );

              // Trigger the second database event
              collection.update({ e: 5 }, { $inc: { e: 2 } }, function(err) {
                assert.ifError(err);
                changeStream.hasNext(function(err, hasNext) {
                  assert.ifError(err);
                  assert.equal(true, hasNext);
                  changeStream.next(function(err, change) {
                    assert.ifError(err);
                    assert.equal(change.operationType, 'update');
                    // Close the change stream
                    changeStream.close(err => client.close(cerr => done(err || cerr)));
                  });
                });
              });
            });
          });

          // Trigger the first database event
          // NOTE: this needs to be triggered after the changeStream call so
          // that the cursor is run
          collection.insert({ e: 5 }, function(err, result) {
            assert.ifError(err);
            assert.equal(result.insertedCount, 1);
          });
        });
      }
    }
  );

  it('Should support creating multiple simultaneous Change Streams', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var theCollection1 = theDatabase.collection('simultaneous1');
        var theCollection2 = theDatabase.collection('simultaneous2');

        var thisChangeStream1, thisChangeStream2, thisChangeStream3;

        setTimeout(() => {
          theCollection1.insert({ a: 1 }).then(function() {
            return theCollection2.insert({ a: 1 });
          });
        });

        Promise.resolve()
          .then(function() {
            thisChangeStream1 = theCollection1.watch([{ $addFields: { changeStreamNumber: 1 } }]);
            thisChangeStream2 = theCollection2.watch([{ $addFields: { changeStreamNumber: 2 } }]);
            thisChangeStream3 = theCollection2.watch([{ $addFields: { changeStreamNumber: 3 } }]);

            return Promise.all([
              thisChangeStream1.hasNext(),
              thisChangeStream2.hasNext(),
              thisChangeStream3.hasNext()
            ]);
          })
          .then(function(hasNexts) {
            // Check all the Change Streams have a next item
            assert.ok(hasNexts[0]);
            assert.ok(hasNexts[1]);
            assert.ok(hasNexts[2]);

            return Promise.all([
              thisChangeStream1.next(),
              thisChangeStream2.next(),
              thisChangeStream3.next()
            ]);
          })
          .then(function(changes) {
            // Check the values of the change documents are correct
            assert.equal(changes[0].operationType, 'insert');
            assert.equal(changes[1].operationType, 'insert');
            assert.equal(changes[2].operationType, 'insert');

            assert.equal(changes[0].fullDocument.a, 1);
            assert.equal(changes[1].fullDocument.a, 1);
            assert.equal(changes[2].fullDocument.a, 1);

            assert.equal(changes[0].ns.db, 'integration_tests');
            assert.equal(changes[1].ns.db, 'integration_tests');
            assert.equal(changes[2].ns.db, 'integration_tests');

            assert.equal(changes[0].ns.coll, 'simultaneous1');
            assert.equal(changes[1].ns.coll, 'simultaneous2');
            assert.equal(changes[2].ns.coll, 'simultaneous2');

            assert.equal(changes[0].changeStreamNumber, 1);
            assert.equal(changes[1].changeStreamNumber, 2);
            assert.equal(changes[2].changeStreamNumber, 3);

            return Promise.all([
              thisChangeStream1.close(),
              thisChangeStream2.close(),
              thisChangeStream3.close()
            ]);
          })
          .then(() => client.close())
          .then(function() {
            done();
          })
          .catch(function(err) {
            assert.ifError(err);
          });
      });
    }
  });

  it('Should properly close Change Stream cursor', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);
        var theDatabase = client.db('integration_tests');

        var thisChangeStream = theDatabase.collection('changeStreamCloseTest').watch(pipeline);

        assert.equal(thisChangeStream.isClosed(), false);
        assert.equal(thisChangeStream.cursor.isClosed(), false);

        thisChangeStream.close(function(err) {
          assert.ifError(err);

          // Check the cursor is closed
          assert.equal(thisChangeStream.isClosed(), true);
          assert.ok(!thisChangeStream.cursor);
          client.close(() => done());
        });
      });
    }
  });

  it(
    'Should error when attempting to create a Change Stream with a forbidden aggrgation pipeline stage',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        const client = configuration.newClient();

        client.connect(function(err, client) {
          assert.ifError(err);

          var theDatabase = client.db('integration_tests');
          var changeStream = theDatabase
            .collection('forbiddenStageTest')
            .watch([{ $alksdjfhlaskdfjh: 2 }]);

          changeStream.next(function(err) {
            assert.ok(err);
            assert.ok(err.message);
            // assert.ok(err.message.indexOf('SOME ERROR MESSAGE HERE ONCE SERVER-29137 IS DONE') > -1);
            changeStream.close(err => client.close(cerr => done(err || cerr)));
          });
        });
      }
    }
  );

  it('Should cache the change stream resume token using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenCallback').watch(pipeline);

        // Trigger the first database event
        setTimeout(() => {
          theDatabase
            .collection('cacheResumeTokenCallback')
            .insert({ b: 2 }, function(err, result) {
              assert.ifError(err);
              assert.equal(result.insertedCount, 1);
            });
        });
        // Fetch the change notification
        thisChangeStream.hasNext(function(err, hasNext) {
          assert.ifError(err);
          assert.equal(true, hasNext);
          thisChangeStream.next(function(err, change) {
            assert.ifError(err);
            assert.deepEqual(thisChangeStream.resumeToken, change._id);

            // Close the change stream
            thisChangeStream.close(err => client.close(cerr => done(err || cerr)));
          });
        });
      });
    }
  });

  it('Should cache the change stream resume token using promises', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(function() {
        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenPromise').watch(pipeline);

        setTimeout(() => {
          // Trigger the first database event
          theDatabase.collection('cacheResumeTokenPromise').insert({ b: 2 }, function(err, result) {
            assert.ifError(err);
            assert.equal(result.insertedCount, 1);
            // Fetch the change notification
          });
        });

        return thisChangeStream
          .hasNext()
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return thisChangeStream.next();
          })
          .then(function(change) {
            assert.deepEqual(thisChangeStream.resumeToken, change._id);

            // Close the change stream
            return thisChangeStream.close().then(() => client.close());
          });
      });
    }
  });

  it('Should cache the change stream resume token using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');

        var thisChangeStream = theDatabase.collection('cacheResumeTokenListener').watch(pipeline);

        thisChangeStream.once('change', function(change) {
          assert.deepEqual(thisChangeStream.resumeToken, change._id);
          // Close the change stream
          thisChangeStream.close().then(() => client.close(done));
        });

        setTimeout(() => {
          // Trigger the first database event
          theDatabase
            .collection('cacheResumeTokenListener')
            .insert({ b: 2 }, function(err, result) {
              assert.ifError(err);
              assert.equal(result.insertedCount, 1);
            });
        });
      });
    }
  });

  it(
    'Should error if resume token projected out of change stream document using imperative callback form',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        const client = configuration.newClient();

        client.connect(function(err, client) {
          assert.ifError(err);

          var theDatabase = client.db('integration_tests');
          var thisChangeStream = theDatabase
            .collection('resumetokenProjectedOutCallback')
            .watch([{ $project: { _id: false } }]);

          // Trigger the first database event
          setTimeout(() => {
            theDatabase
              .collection('resumetokenProjectedOutCallback')
              .insert({ b: 2 }, function(err, result) {
                assert.ifError(err);
                assert.equal(result.insertedCount, 1);
              });
          });

          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);

            thisChangeStream.next(function(err) {
              assert.ok(err);
              assert.equal(
                err.message,
                'A change stream document has been received that lacks a resume token (_id).'
              );

              // Close the change stream
              thisChangeStream.close().then(() => client.close(done));
            });
          });
        });
      }
    }
  );

  it('Should error if resume token projected out of change stream document using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase
          .collection('resumetokenProjectedOutListener')
          .watch([{ $project: { _id: false } }]);

        // Fetch the change notification
        thisChangeStream.on('change', function() {
          assert.ok(false);
        });

        thisChangeStream.on('error', function(err) {
          assert.equal(
            err.message,
            'A change stream document has been received that lacks a resume token (_id).'
          );

          thisChangeStream.close(() => client.close(done));
        });

        // Trigger the first database event
        setTimeout(() => {
          theDatabase
            .collection('resumetokenProjectedOutListener')
            .insert({ b: 2 }, function(err, result) {
              assert.ifError(err);
              assert.equal(result.insertedCount, 1);
            });
        });
      });
    }
  });

  it('Should invalidate change stream on collection rename using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStream = database.collection('invalidateListeners').watch(pipeline);

        // Attach first event listener
        changeStream.once('change', function(change) {
          assert.equal(change.operationType, 'insert');
          assert.equal(change.fullDocument.a, 1);
          assert.equal(change.ns.db, 'integration_tests');
          assert.equal(change.ns.coll, 'invalidateListeners');
          assert.ok(!change.documentKey);
          assert.equal(
            change.comment,
            'The documentKey field has been projected out of this document.'
          );

          // Attach second event listener
          changeStream.on('change', function(change) {
            if (change.operationType === 'invalidate') {
              // now expect the server to close the stream
              changeStream.once('close', () => client.close(done));
            }
          });

          // Trigger the second database event
          setTimeout(() => {
            database
              .collection('invalidateListeners')
              .rename('renamedDocs', { dropTarget: true }, function(err) {
                assert.ifError(err);
              });
          }, 250);
        });

        // Trigger the first database event
        setTimeout(() => {
          database.collection('invalidateListeners').insert({ a: 1 }, function(err) {
            assert.ifError(err);
          });
        });
      });
    }
  });

  it('Should invalidate change stream on database drop using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStream = database.collection('invalidateCallback').watch(pipeline);

        // Trigger the first database event
        setTimeout(() => {
          database.collection('invalidateCallback').insert({ a: 1 }, function(err) {
            assert.ifError(err);
          });
        });
        return changeStream.next(function(err, change) {
          assert.ifError(err);
          assert.equal(change.operationType, 'insert');

          database.dropDatabase(function(err) {
            assert.ifError(err);

            function completeStream() {
              changeStream.hasNext(function(err, hasNext) {
                assert.equal(hasNext, false);
                assert.equal(changeStream.isClosed(), true);
                client.close(done);
              });
            }

            function checkInvalidate() {
              changeStream.next(function(err, change) {
                assert.ifError(err);

                // Check the cursor invalidation has occured
                if (change.operationType === 'invalidate') {
                  return completeStream();
                }

                checkInvalidate();
              });
            }

            checkInvalidate();
          });
        });
      });
    }
  });

  it('Should invalidate change stream on collection drop using promises', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      function checkInvalidate(changeStream) {
        return changeStream.next().then(change => {
          if (change.operationType === 'invalidate') {
            return Promise.resolve();
          }

          return checkInvalidate(changeStream);
        });
      }

      client.connect(function(err, client) {
        assert.ifError(err);
        var database = client.db('integration_tests');
        var changeStream = database.collection('invalidateCollectionDropPromises').watch(pipeline);

        // Trigger the first database event
        setTimeout(() => {
          return database
            .collection('invalidateCollectionDropPromises')
            .insert({ a: 1 })
            .then(function() {
              return delay(200);
            });
        }, 200);

        return changeStream
          .next()
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            return database.dropCollection('invalidateCollectionDropPromises');
          })
          .then(() => checkInvalidate(changeStream))
          .then(() => changeStream.hasNext())
          .then(function(hasNext) {
            assert.equal(hasNext, false);
            assert.equal(changeStream.isClosed(), true);
            client.close(done);
          })
          .catch(function(err) {
            assert.ifError(err);
          });
      });
    }
  });

  it('Should return MongoNetworkError after first retry attempt fails using promises', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;

      // Contain mock server
      var primaryServer = null;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(
              Object.assign(
                {
                  ismaster: true,
                  secondary: false,
                  me: 'localhost:32000',
                  primary: 'localhost:32000',
                  tags: { loc: 'ny' }
                },
                defaultFields
              )
            );
          } else {
            // kill the connection, simulating a network error
            request.connection.destroy();
          }
        });
      });

      const mockServerURL = 'mongodb://localhost:32000/';
      const client = configuration.newClient(mockServerURL);

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var collection = database.collection('MongoNetworkErrorTestPromises');
        var changeStream = collection.watch(pipeline);

        return changeStream
          .next()
          .then(function() {
            // We should never execute this line because calling thisChangeStream.next() should throw an error
            throw new Error(
              'ChangeStream.next() returned a change document but it should have returned a MongoNetworkError'
            );
          })
          .catch(function(err) {
            assert.ok(
              err instanceof MongoNetworkError,
              'error was not instance of MongoNetworkError'
            );
            assert.ok(err.message);
            assert.ok(err.message.indexOf('closed') > -1);

            changeStream.close(function(err) {
              assert.ifError(err);
              changeStream.close();

              // running = false;
              primaryServer.destroy();

              client.close(() => mock.cleanup(() => done()));
            });
          })
          .catch(err => done(err));
      });
    }
  });

  it('Should return MongoNetworkError after first retry attempt fails using callbacks', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },
    test: function(done) {
      var configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;

      // Contain mock server
      var primaryServer = null;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      // Die
      var die = false;

      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die) {
            request.connection.destroy();
          } else if (doc.ismaster) {
            request.reply(
              Object.assign(
                {
                  ismaster: true,
                  secondary: false,
                  me: 'localhost:32000',
                  primary: 'localhost:32000',
                  tags: { loc: 'ny' }
                },
                defaultFields
              )
            );
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
          // Do not respond to other requests
        });
      });

      const client = configuration.newClient('mongodb://localhost:32000/', {
        socketTimeoutMS: 500,
        validateOptions: true
      });

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var theCollection = theDatabase.collection('MongoNetworkErrorTestPromises');
        var thisChangeStream = theCollection.watch(pipeline);

        thisChangeStream.next(function(err, change) {
          assert.ok(err instanceof MongoNetworkError);
          assert.ok(err.message);
          assert.ok(err.message.indexOf('timed out') > -1);

          assert.equal(
            change,
            null,
            'ChangeStream.next() returned a change document but it should have returned a MongoNetworkError'
          );

          thisChangeStream.close(function(err) {
            assert.ifError(err);
            thisChangeStream.close();

            client.close(() => mock.cleanup(() => done()));
          });
        });
      });
    }
  });

  it('Should resume Change Stream when a resumable error is encountered', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },
    test: function(done) {
      var configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;
      const Timestamp = configuration.require.Timestamp;
      const Long = configuration.require.Long;

      // Contain mock server
      var primaryServer = null;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      // Die
      var callsToGetMore = 0;

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');

        var counter = 0;
        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          // Create a server that responds to the initial aggregation to connect to the server, but not to subsequent getMore requests
          if (doc.ismaster) {
            request.reply(
              Object.assign(
                {
                  ismaster: true,
                  secondary: false,
                  me: 'localhost:32000',
                  primary: 'localhost:32000',
                  tags: { loc: 'ny' }
                },
                defaultFields
              )
            );
          } else if (doc.getMore) {
            callsToGetMore++;
          } else if (doc.aggregate) {
            var changeDoc = {
              _id: {
                ts: new Timestamp(4, 1501511802),
                ns: 'integration_tests.docsDataEvent',
                _id: new ObjectId('597f407a8fd4abb616feca93')
              },
              operationType: 'insert',
              ns: {
                db: 'integration_tests',
                coll: 'docsDataEvent'
              },
              fullDocument: {
                _id: new ObjectId('597f407a8fd4abb616feca93'),
                a: 1,
                counter: counter++
              }
            };
            request.reply(changeDoc, {
              cursorId: new Long(1407, 1407)
            });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });
      });

      let finalError = undefined;
      const client = configuration.newClient('mongodb://localhost:32000/', {
        socketTimeoutMS: 500,
        validateOptions: true
      });

      client
        .connect()
        .then(client => {
          var database = client.db('integration_tests');
          var collection = database.collection('MongoNetworkErrorTestPromises');
          var changeStream = collection.watch(pipeline);

          return changeStream
            .next()
            .then(function(change) {
              assert.ok(change);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.fullDocument.counter, 0);

              // Add a tag to the cursor
              changeStream.cursor.track = 1;

              return changeStream.next();
            })
            .then(function(change) {
              assert.ok(change);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.fullDocument.counter, 1);

              // Check this cursor doesn't have the tag added earlier (therefore it is a new cursor)
              assert.notEqual(changeStream.cursor.track, 1);

              // Check that only one getMore call was made
              assert.equal(callsToGetMore, 1);

              return Promise.all([changeStream.close(), primaryServer.destroy]).then(() =>
                client.close()
              );
            });
        })
        .catch(err => (finalError = err))
        .then(() => mock.cleanup())
        .catch(err => (finalError = err))
        .then(() => done(finalError));
    }
  });

  it('Should resume from point in time using user-provided resumeAfter', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        var database = client.db('integration_tests');
        var collection = database.collection('resumeAfterTest2');

        var firstChangeStream, secondChangeStream;

        var resumeToken;
        var docs = [{ a: 0 }, { a: 1 }, { a: 2 }];

        // Trigger the first database event

        firstChangeStream = collection.watch(pipeline);
        setTimeout(() => {
          return collection
            .insert(docs[0])
            .then(function(result) {
              assert.equal(result.insertedCount, 1);
              return collection.insert(docs[1]);
            })
            .then(function(result) {
              assert.equal(result.insertedCount, 1);
              return collection.insert(docs[2]);
            })
            .then(function(result) {
              assert.equal(result.insertedCount, 1);
              return delay(200);
            });
        });
        return firstChangeStream
          .hasNext()
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return firstChangeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[0].a);

            // Save the resumeToken
            resumeToken = change._id;
            return firstChangeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[1].a);

            return firstChangeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[2].a);

            return firstChangeStream.close();
          })
          .then(function() {
            secondChangeStream = collection.watch(pipeline, {
              resumeAfter: resumeToken
            });
            return delay(200);
          })
          .then(function() {
            return secondChangeStream.hasNext();
          })
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return secondChangeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[1].a);
            return secondChangeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[2].a);
            return secondChangeStream.close();
          })
          .then(() => client.close());
      });
    }
  });

  it('Should support full document lookup', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        var database = client.db('integration_tests');
        var collection = database.collection('fullDocumentLookup');
        var changeStream = collection.watch(pipeline, {
          fullDocument: 'updateLookup'
        });

        setTimeout(() => {
          return collection.insert({ f: 128 }).then(function(result) {
            assert.equal(result.insertedCount, 1);
          });
        });
        return changeStream
          .hasNext()
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.f, 128);
            assert.equal(change.ns.db, database.databaseName);
            assert.equal(change.ns.coll, collection.collectionName);
            assert.ok(!change.documentKey);
            assert.equal(
              change.comment,
              'The documentKey field has been projected out of this document.'
            );
            return collection.update({ f: 128 }, { $set: { c: 2 } });
          })
          .then(function() {
            return changeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'update');

            // Check the correct fullDocument is present
            assert.ok(change.fullDocument);
            assert.equal(change.fullDocument.f, 128);
            assert.equal(change.fullDocument.c, 2);

            return changeStream.close().then(() => client.close());
          });
      });
    }
  });

  it('Should support full document lookup with deleted documents', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        var database = client.db('integration_tests');
        var collection = database.collection('fullLookupTest');
        var changeStream = collection.watch(pipeline, {
          fullDocument: 'updateLookup'
        });

        // Trigger the first database event
        setTimeout(() => {
          return collection
            .insert({ i: 128 })
            .then(function(result) {
              assert.equal(result.insertedCount, 1);

              return collection.deleteOne({ i: 128 });
            })
            .then(function(result) {
              assert.equal(result.result.n, 1);
            });
        });
        return changeStream
          .hasNext()
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.i, 128);
            assert.equal(change.ns.db, database.databaseName);
            assert.equal(change.ns.coll, collection.collectionName);
            assert.ok(!change.documentKey);
            assert.equal(
              change.comment,
              'The documentKey field has been projected out of this document.'
            );

            // Trigger the second database event
            return collection.update({ i: 128 }, { $set: { c: 2 } });
          })
          .then(function() {
            return changeStream.hasNext();
          })
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'delete');

            // Check the full lookedUpDocument is present
            assert.equal(change.lookedUpDocument, null);

            return changeStream.close();
          })
          .then(() => client.close());
      });
    }
  });

  it('Should create Change Streams with correct read preferences', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var ReadPreference = configuration.require.ReadPreference;
      const client = configuration.newClient();

      return client.connect().then(client => {
        // Should get preference from database
        var database = client.db('integration_tests', {
          readPreference: ReadPreference.PRIMARY_PREFERRED
        });

        var changeStream0 = database.collection('docs0').watch(pipeline);
        assert.deepEqual(
          changeStream0.cursor.readPreference.preference,
          ReadPreference.PRIMARY_PREFERRED
        );

        // Should get preference from collection
        var collection = database.collection('docs1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });

        var changeStream1 = collection.watch(pipeline);
        assert.deepEqual(
          changeStream1.cursor.readPreference.preference,
          ReadPreference.SECONDARY_PREFERRED
        );

        // Should get preference from Change Stream options
        var changeStream2 = collection.watch(pipeline, {
          readPreference: ReadPreference.NEAREST
        });

        assert.deepEqual(changeStream2.cursor.readPreference.preference, ReadPreference.NEAREST);

        return Promise.all([
          changeStream0.close(),
          changeStream1.close(),
          changeStream2.close()
        ]).then(() => client.close());
      });
    }
  });

  it('Should support piping of Change Streams', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var fs = require('fs');
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var theCollection = theDatabase.collection('pipeTest');
        var thisChangeStream = theCollection.watch(pipeline);

        var filename = '/tmp/_nodemongodbnative_stream_out.txt';
        var outStream = fs.createWriteStream(filename);

        // Make a stream transforming to JSON and piping to the file
        thisChangeStream.stream({ transform: JSON.stringify }).pipe(outStream);

        setTimeout(() => {
          theCollection.insert({ a: 1 }, function(err) {
            assert.ifError(err);
          });
        });

        // Listen for changes to the file
        var watcher = fs.watch(filename, function(eventType) {
          assert.equal(eventType, 'change');

          var fileContents = fs.readFileSync(filename, 'utf8');
          var parsedFileContents = JSON.parse(fileContents);
          assert.equal(parsedFileContents.fullDocument.a, 1);

          watcher.close();

          thisChangeStream.close(err => client.close(cErr => done(err || cErr)));
        });
      });
    }
  });

  it.skip('Should resume piping of Change Streams when a resumable error is encountered', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },
    test: function(done) {
      var configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;
      const Timestamp = configuration.require.Timestamp;
      const Long = configuration.require.Long;

      // Contain mock server
      var primaryServer = null;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      co(function*() {
        primaryServer = yield mock.createServer();

        var counter = 0;
        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          // Create a server that responds to the initial aggregation to connect to the server, but not to subsequent getMore requests
          if (doc.ismaster) {
            request.reply(
              Object.assign(
                {
                  ismaster: true,
                  secondary: false,
                  me: primaryServer.uri(),
                  primary: primaryServer.uri(),
                  tags: { loc: 'ny' }
                },
                defaultFields
              )
            );
          } else if (doc.getMore) {
            var changeDoc = {
              cursor: {
                id: new Long(1407, 1407),
                nextBatch: [
                  {
                    _id: {
                      ts: new Timestamp(4, 1501511802),
                      ns: 'integration_tests.docsDataEvent',
                      _id: new ObjectId('597f407a8fd4abb616feca93')
                    },
                    operationType: 'insert',
                    ns: {
                      db: 'integration_tests',
                      coll: 'docsDataEvent'
                    },
                    fullDocument: {
                      _id: new ObjectId('597f407a8fd4abb616feca93'),
                      a: 1,
                      counter: counter++
                    }
                  }
                ]
              },
              ok: 1
            };
            request.reply(changeDoc, {
              cursorId: new Long(1407, 1407)
            });
          } else if (doc.aggregate) {
            changeDoc = {
              _id: {
                ts: new Timestamp(4, 1501511802),
                ns: 'integration_tests.docsDataEvent',
                _id: new ObjectId('597f407a8fd4abb616feca93')
              },
              operationType: 'insert',
              ns: {
                db: 'integration_tests',
                coll: 'docsDataEvent'
              },
              fullDocument: {
                _id: new ObjectId('597f407a8fd4abb616feca93'),
                a: 1,
                counter: counter++
              }
            };
            request.reply(changeDoc, {
              cursorId: new Long(1407, 1407)
            });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = configuration.newClient(`mongodb://${primaryServer.uri()}/`, {
          socketTimeoutMS: 500,
          validateOptions: true
        });

        client.connect(function(err, client) {
          assert.ifError(err);

          var fs = require('fs');
          var theDatabase = client.db('integration_tests5');
          var theCollection = theDatabase.collection('MongoNetworkErrorTestPromises');
          var thisChangeStream = theCollection.watch(pipeline);

          var filename = '/tmp/_nodemongodbnative_resumepipe.txt';
          var outStream = fs.createWriteStream(filename);

          thisChangeStream.stream({ transform: JSON.stringify }).pipe(outStream);

          // Listen for changes to the file
          var watcher = fs.watch(filename, function(eventType) {
            assert.equal(eventType, 'change');

            var fileContents = fs.readFileSync(filename, 'utf8');

            var parsedFileContents = JSON.parse(fileContents);
            assert.equal(parsedFileContents.fullDocument.a, 1);

            watcher.close();

            thisChangeStream.close(function(err) {
              assert.ifError(err);

              mock.cleanup(() => done());
            });
          });
        });
      });
    }
  });

  it('Should support piping of Change Streams through multiple pipes', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var crypto = require('crypto');
      const client = configuration.newClient(configuration.url(), {
        poolSize: 1,
        autoReconnect: false
      });

      client.connect(function(err, client) {
        assert.ifError(err);

        var cipher = crypto.createCipher('aes192', 'a password');
        var decipher = crypto.createDecipher('aes192', 'a password');

        var theDatabase = client.db('integration_tests');
        var theCollection = theDatabase.collection('multiPipeTest');
        var thisChangeStream = theCollection.watch(pipeline);

        // Make a stream transforming to JSON and piping to the file
        var basicStream = thisChangeStream.pipe(
          new Transform({
            transform: (data, encoding, callback) => callback(null, JSON.stringify(data)),
            objectMode: true
          })
        );
        var pipedStream = basicStream.pipe(cipher).pipe(decipher);

        var dataEmitted = '';
        pipedStream.on('data', function(data) {
          dataEmitted += data.toString();

          // Work around poor compatibility with crypto cipher
          thisChangeStream.cursor.emit('end');
        });

        pipedStream.on('end', function() {
          var parsedData = JSON.parse(dataEmitted.toString());
          assert.equal(parsedData.operationType, 'insert');
          assert.equal(parsedData.fullDocument.a, 1407);

          basicStream.emit('close');

          thisChangeStream.close(err => client.close(cErr => done(err || cErr)));
        });

        pipedStream.on('error', function(err) {
          done(err);
        });

        setTimeout(() => {
          theCollection.insert({ a: 1407 }, function(err) {
            if (err) done(err);
          });
        });
      });
    }
  });

  it('Should resume after a killCursors command is issued for its child cursor', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      const collectionName = 'resumeAfterKillCursor';

      let db;
      let coll;
      let changeStream;

      function close(e) {
        changeStream.close(() => client.close(() => done(e)));
      }

      client
        .connect()
        .then(() => (db = client.db('integration_tests')))
        .then(() => (coll = db.collection(collectionName)))
        .then(() => (changeStream = coll.watch()))
        .then(() => ({ p: changeStream.next() }))
        .then(x => coll.insertOne({ darmok: 'jalad' }).then(() => x.p))
        .then(() =>
          db.command({
            killCursors: collectionName,
            cursors: [changeStream.cursor.cursorState.cursorId]
          })
        )
        .then(() => coll.insertOne({ shaka: 'walls fell' }))
        .then(() => changeStream.next())
        .then(change => {
          expect(change).to.have.property('operationType', 'insert');
          expect(change).to.have.nested.property('fullDocument.shaka', 'walls fell');
        })
        .then(() => close(), e => close(e));
    }
  });

  it('Should include a startAtOperationTime field when resuming if no changes have been received', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.7.3' } },
    test: function(done) {
      const configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;
      const Timestamp = configuration.require.Timestamp;
      const Long = configuration.require.Long;

      const OPERATION_TIME = new Timestamp(4, 1501511802);

      const makeIsMaster = server => ({
        ismaster: true,
        secondary: false,
        me: server.uri(),
        primary: server.uri(),
        tags: { loc: 'ny' },
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 7,
        minWireVersion: 0,
        ok: 1,
        hosts: [server.uri()],
        operationTime: OPERATION_TIME,
        $clusterTime: {
          clusterTime: OPERATION_TIME
        }
      });

      const AGGREGATE_RESPONSE = {
        ok: 1,
        cursor: {
          firstBatch: [],
          id: new Long('9064341847921713401'),
          ns: 'test.test'
        },
        operationTime: OPERATION_TIME,
        $clusterTime: {
          clusterTime: OPERATION_TIME
        }
      };

      const CHANGE_DOC = {
        _id: {
          ts: OPERATION_TIME,
          ns: 'integration_tests.docsDataEvent',
          _id: new ObjectId('597f407a8fd4abb616feca93')
        },
        operationType: 'insert',
        ns: {
          db: 'integration_tests',
          coll: 'docsDataEvent'
        },
        fullDocument: {
          _id: new ObjectId('597f407a8fd4abb616feca93'),
          a: 1,
          counter: 0
        }
      };

      const GET_MORE_RESPONSE = {
        ok: 1,
        cursor: {
          nextBatch: [CHANGE_DOC],
          id: new Long('9064341847921713401'),
          ns: 'test.test'
        },
        cursorId: new Long('9064341847921713401')
      };

      const dbName = 'integration_tests';
      const collectionName = 'resumeWithStartAtOperationTime';
      const connectOptions = {
        socketTimeoutMS: 500,
        validateOptions: true
      };

      let getMoreCounter = 0;
      let aggregateCounter = 0;
      let changeStream;
      let server;
      let client;

      let finish = err => {
        finish = () => {};
        Promise.resolve()
          .then(() => changeStream && changeStream.close())
          .then(() => client && client.close())
          .then(() => done(err));
      };

      function primaryServerHandler(request) {
        try {
          const doc = request.document;

          if (doc.ismaster) {
            return request.reply(makeIsMaster(server));
          } else if (doc.aggregate) {
            if (aggregateCounter++ > 0) {
              expect(doc).to.have.nested.property('pipeline[0].$changeStream.startAtOperationTime');
              expect(doc.pipeline[0].$changeStream.startAtOperationTime.equals(OPERATION_TIME)).to
                .be.ok;
              expect(doc).to.not.have.nested.property('pipeline[0].$changeStream.resumeAfter');
            } else {
              expect(doc).to.not.have.nested.property(
                'pipeline[0].$changeStream.startAtOperationTime'
              );
              expect(doc).to.not.have.nested.property('pipeline[0].$changeStream.resumeAfter');
            }
            return request.reply(AGGREGATE_RESPONSE);
          } else if (doc.getMore) {
            if (getMoreCounter++ === 0) {
              return;
            }

            request.reply(GET_MORE_RESPONSE);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        } catch (e) {
          finish(e);
        }
      }

      mock
        .createServer()
        .then(_server => (server = _server))
        .then(() => server.setMessageHandler(primaryServerHandler))
        .then(() => (client = configuration.newClient(`mongodb://${server.uri()}`, connectOptions)))
        .then(() => client.connect())
        .then(() => client.db(dbName))
        .then(db => db.collection(collectionName))
        .then(col => col.watch(pipeline))
        .then(_changeStream => (changeStream = _changeStream))
        .then(() => changeStream.next())
        .then(() => finish(), err => finish(err));
    }
  });
});
