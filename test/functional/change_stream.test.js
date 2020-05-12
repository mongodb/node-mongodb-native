'use strict';
var assert = require('assert');
var Transform = require('stream').Transform;
const MongoError = require('../../lib/core').MongoError;
var MongoNetworkError = require('../../lib/core').MongoNetworkError;
var setupDatabase = require('./shared').setupDatabase;
var withTempDb = require('./shared').withTempDb;
var delay = require('./shared').delay;
var co = require('co');
var mock = require('mongodb-mock-server');
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');

chai.use(require('chai-subset'));

/**
 * Triggers a fake resumable error on a change stream
 *
 * @param {ChangeStream} changeStream
 * @param {number} [delay] optional delay before triggering error
 * @param {Function} onClose callback when cursor closed due this error
 */
function triggerResumableError(changeStream, delay, onClose) {
  if (arguments.length === 2) {
    onClose = delay;
    delay = undefined;
  }

  const stub = sinon.stub(changeStream.cursor, 'close');
  stub.callsFake(function() {
    stub.wrappedMethod.call(this);
    stub.restore();
    onClose();
  });

  function triggerError() {
    changeStream.cursor.emit('error', new MongoNetworkError('fake error'));
  }

  if (delay != null) {
    setTimeout(triggerError, delay);
    return;
  }

  triggerError();
}

/**
 * Waits for a change stream to start
 *
 * @param {ChangeStream} changeStream
 * @param {function} callback
 */
function waitForStarted(changeStream, callback) {
  const timeout = setTimeout(() => {
    throw new Error('Change stream never started');
  }, 2000);
  changeStream.cursor.once('init', () => {
    clearTimeout(timeout);
    callback();
  });
}

/**
 * Iterates the next discrete batch of a change stream non-eagerly. This
 * will return `null` if the next bach is empty, rather than waiting forever
 * for a non-empty batch.
 *
 * @param {ChangeStream} changeStream
 * @param {function} callback
 */
function tryNext(changeStream, callback) {
  let complete = false;
  function done(err, result) {
    if (complete) return;
    // if the arity is 1 then this a callback for `more`
    if (arguments.length === 1) {
      result = err;
      const batch = result.cursor.firstBatch || result.cursor.nextBatch;
      if (batch.length === 0) {
        complete = true;
        callback(null, null);
      }

      return;
    }

    // otherwise, this a normal response to `next`
    complete = true;
    changeStream.removeListener('more', done);
    if (err) return callback(err);
    callback(err, result);
  }

  // race the two requests
  changeStream.next(done);
  changeStream.cursor.once('more', done);
}

/**
 * Exhausts a change stream aggregating all responses until the first
 * empty batch into a returned array of events.
 *
 * @param {ChangeStream} changeStream
 * @param {Function|Array} bag
 * @param {Function} [callback]
 */
function exhaust(changeStream, bag, callback) {
  if (typeof bag === 'function') {
    callback = bag;
    bag = [];
  }

  tryNext(changeStream, (err, doc) => {
    if (err) return callback(err);
    if (doc === null) return callback(undefined, bag);

    bag.push(doc);
    exhaust(changeStream, bag, callback);
  });
}

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

    return client
      .connect()
      .then(() => {
        const db = client.db('integration_tests');
        return db.createCollection('test');
      })
      .then(
        () => client.close(),
        () => client.close()
      );
  });
  afterEach(() => mock.cleanup());

  it('Should close the listeners after the cursor is closed', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      let closed = false;
      const close = _err => {
        if (closed) {
          return;
        }
        closed = true;
        return client.close(() => done(_err));
      };
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        const coll = client.db('integration_tests').collection('listenertest');
        const changeStream = coll.watch();
        changeStream.on('change', () => {
          const internalCursor = changeStream.cursor;
          expect(internalCursor.listenerCount('data')).to.equal(1);
          changeStream.close(err => {
            expect(internalCursor.listenerCount('data')).to.equal(0);
            close(err);
          });
        });
        waitForStarted(changeStream, () => coll.insertOne({ x: 1 }));
        changeStream.on('error', err => close(err));
      });
    }
  });

  it('Should create a Change Stream on a collection and emit `change` events', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        const collection = client.db('integration_tests').collection('docsDataEvent');
        const changeStream = collection.watch(pipeline);

        let count = 0;

        const cleanup = _err => {
          changeStream.removeAllListeners('change');
          changeStream.close(err => client.close(cerr => done(_err || err || cerr)));
        };

        // Attach first event listener
        changeStream.on('change', function(change) {
          try {
            if (count === 0) {
              count += 1;
              expect(change).to.containSubset({
                operationType: 'insert',
                fullDocument: { d: 4 },
                ns: {
                  db: 'integration_tests',
                  coll: 'docsDataEvent'
                },
                comment: 'The documentKey field has been projected out of this document.'
              });
              expect(change).to.not.have.property('documentKey');
              return;
            }

            expect(change).to.containSubset({
              operationType: 'update',
              updateDescription: {
                updatedFields: { d: 6 }
              }
            });
            cleanup();
          } catch (e) {
            cleanup(e);
          }
        });

        waitForStarted(changeStream, () => {
          // Trigger the first database event
          collection.insertOne({ d: 4 }, function(err) {
            assert.ifError(err);
            // Trigger the second database event
            collection.updateOne({ d: 4 }, { $inc: { d: 2 } }, function(err) {
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
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
    'Should error when attempting to create a Change Stream with a forbidden aggregation pipeline stage',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        const client = configuration.newClient();

        client.connect(function(err, client) {
          assert.ifError(err);

          const forbiddenStage = {};
          const forbiddenStageName = '$alksdjfhlaskdfjh';
          forbiddenStage[forbiddenStageName] = 2;

          var theDatabase = client.db('integration_tests');
          var changeStream = theDatabase.collection('forbiddenStageTest').watch([forbiddenStage]);

          changeStream.next(function(err) {
            assert.ok(err);
            assert.ok(err.message);
            assert.ok(
              err.message.indexOf(`Unrecognized pipeline stage name: '${forbiddenStageName}'`) > -1
            );
            changeStream.close(err => client.close(cerr => done(err || cerr)));
          });
        });
      }
    }
  );

  it('Should cache the change stream resume token using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenCallback').watch(pipeline);

        // Trigger the first database event
        waitForStarted(thisChangeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(function() {
        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenPromise').watch(pipeline);

        waitForStarted(thisChangeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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

        waitForStarted(thisChangeStream, () => {
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
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
          waitForStarted(thisChangeStream, () => {
            theDatabase
              .collection('resumetokenProjectedOutCallback')
              .insert({ b: 2 }, function(err, result) {
                expect(err).to.not.exist;
                expect(result.insertedCount).to.equal(1);
              });
          });

          // Fetch the change notification
          thisChangeStream.next(function(err) {
            expect(err).to.exist;

            // Close the change stream
            thisChangeStream.close(() => client.close(done));
          });
        });
      }
    }
  );

  it('Should error if resume token projected out of change stream document using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
          expect(err).to.exist;
          thisChangeStream.close(() => client.close(done));
        });

        // Trigger the first database event
        waitForStarted(thisChangeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStream = database
          .collection('invalidateListeners')
          .watch(pipeline, { batchSize: 1 });

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
        waitForStarted(changeStream, () => {
          database.collection('invalidateListeners').insert({ a: 1 }, function(err) {
            assert.ifError(err);
          });
        });
      });
    }
  });

  it('Should invalidate change stream on database drop using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStream = database.collection('invalidateCallback').watch(pipeline);

        // Trigger the first database event
        waitForStarted(changeStream, () => {
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
                expect(err).to.not.exist;
                assert.equal(hasNext, false);
                assert.equal(changeStream.isClosed(true), true);
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
        waitForStarted(changeStream, () => {
          return database
            .collection('invalidateCollectionDropPromises')
            .insert({ a: 1 })
            .then(function() {
              return delay(200);
            });
        });

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
            assert.equal(changeStream.isClosed(true), true);
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
        mongodb: '>=3.6'
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
        mongodb: '>=3.6'
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
        mongodb: '>=3.6'
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

            request.reply({
              ok: 1,
              cursor: {
                id: new Long(1407, 1407),
                firstBatch: [changeDoc]
              }
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
        waitForStarted(firstChangeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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

        waitForStarted(changeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
        waitForStarted(changeStream, () => {
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const stream = require('stream');
      const client = configuration.newClient();

      client.connect(function(err, client) {
        assert.ifError(err);

        const theDatabase = client.db('integration_tests');
        const theCollection = theDatabase.collection('pipeTest');
        const thisChangeStream = theCollection.watch(pipeline);

        const outStream = new stream.PassThrough({ objectMode: true });

        // Make a stream transforming to JSON and piping to the file
        thisChangeStream.stream({ transform: JSON.stringify }).pipe(outStream);

        function close(_err) {
          thisChangeStream.close(err => client.close(cErr => done(_err || err || cErr)));
        }

        outStream
          .on('data', data => {
            try {
              const parsedEvent = JSON.parse(data);
              assert.equal(parsedEvent.fullDocument.a, 1);
              close();
            } catch (e) {
              close(e);
            }
          })
          .on('error', close);

        waitForStarted(thisChangeStream, () => {
          theCollection.insert({ a: 1 }, function(err) {
            assert.ifError(err);
          });
        });
      });
    }
  });

  it.skip('Should resume piping of Change Streams when a resumable error is encountered', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.6'
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

            request.reply({
              ok: 1,
              cursor: {
                id: new Long(1407, 1407),
                firstBatch: [changeDoc]
              }
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

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

        waitForStarted(thisChangeStream, () => {
          theCollection.insert({ a: 1407 }, function(err) {
            if (err) done(err);
          });
        });
      });
    }
  });

  it('should maintain change stream options on resume', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
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

      const changeStreamOptions = {
        fullDocument: 'updateLookup',
        collation: { maxVariable: 'punct' },
        maxAwaitTimeMS: 20000,
        batchSize: 200
      };

      client
        .connect()
        .then(() => (db = client.db('integration_tests')))
        .then(() => (coll = db.collection(collectionName)))
        .then(() => (changeStream = coll.watch([], changeStreamOptions)))
        .then(() => {
          expect(changeStream.cursor.resumeOptions).to.containSubset(changeStreamOptions);
        })
        .then(
          () => close(),
          e => close(e)
        );
    }
  });

  // 9. $changeStream stage for ChangeStream against a server >=4.0 and <4.0.7 that has not received
  // any results yet MUST include a startAtOperationTime option when resuming a change stream.
  it('Should include a startAtOperationTime field when resuming if no changes have been received', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=4.0 <4.0.7' } },
    test: function(done) {
      const configuration = this.configuration;
      const ObjectId = configuration.require.ObjectId;
      const Timestamp = configuration.require.Timestamp;
      const Long = configuration.require.Long;

      const OPERATION_TIME = new Timestamp(4, 1501511802);

      const makeIsMaster = server => ({
        __nodejs_mock_server__: true,
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
        validateOptions: true,
        monitorCommands: true
      };

      let getMoreCounter = 0;
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
            return request.reply(AGGREGATE_RESPONSE);
          } else if (doc.getMore) {
            if (getMoreCounter++ === 0) {
              request.reply({ ok: 0 });
              return;
            }

            request.reply(GET_MORE_RESPONSE);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          } else if (doc.killCursors) {
            request.reply({ ok: 1 });
          }
        } catch (e) {
          finish(e);
        }
      }

      const started = [];

      mock
        .createServer()
        .then(_server => (server = _server))
        .then(() => server.setMessageHandler(primaryServerHandler))
        .then(() => (client = configuration.newClient(`mongodb://${server.uri()}`, connectOptions)))
        .then(() => client.connect())
        .then(() => {
          client.on('commandStarted', e => {
            if (e.commandName === 'aggregate') {
              started.push(e);
            }
          });
        })
        .then(() => client.db(dbName))
        .then(db => db.collection(collectionName))
        .then(col => col.watch(pipeline))
        .then(_changeStream => (changeStream = _changeStream))
        .then(() => changeStream.next())
        .then(() => {
          const first = started[0].command;
          expect(first).to.have.nested.property('pipeline[0].$changeStream');
          const firstStage = first.pipeline[0].$changeStream;
          expect(firstStage).to.not.have.property('resumeAfter');
          expect(firstStage).to.not.have.property('startAtOperationTime');

          const second = started[1].command;
          expect(second).to.have.nested.property('pipeline[0].$changeStream');
          const secondStage = second.pipeline[0].$changeStream;
          expect(secondStage).to.not.have.property('resumeAfter');
          expect(secondStage).to.have.property('startAtOperationTime');
          expect(secondStage.startAtOperationTime.equals(OPERATION_TIME)).to.be.ok;
        })
        .then(
          () => finish(),
          err => finish(err)
        );
    }
  });

  it('should not resume when error includes error label NonRetryableChangeStreamError', function() {
    let server;
    let client;
    let changeStream;

    function teardown(e) {
      return Promise.resolve()
        .then(() => changeStream && changeStream.close())
        .catch(() => {})
        .then(() => client && client.close())
        .catch(() => {})
        .then(() => e && Promise.reject(e));
    }

    const db = 'foobar';
    const coll = 'foobar';
    const ns = `${db}.${coll}`;

    let aggregateCount = 0;
    let getMoreCount = 0;

    function messageHandler(request) {
      const doc = request.document;

      if (doc.ismaster) {
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER_36, {
            ismaster: true,
            secondary: false,
            me: server.uri(),
            primary: server.uri()
          })
        );
      } else if (doc.aggregate) {
        aggregateCount += 1;
        request.reply({
          ok: 1,
          cursor: {
            firstBatch: [],
            id: 1,
            ns
          }
        });
      } else if (doc.getMore) {
        if (getMoreCount === 0) {
          getMoreCount += 1;
          request.reply({
            ok: 0,
            errorLabels: ['NonRetryableChangeStreamError']
          });
        } else {
          getMoreCount += 1;
          request.reply({
            ok: 1,
            cursor: {
              nextBatch: [
                {
                  _id: {},
                  operationType: 'insert',
                  ns: { db, coll },
                  fullDocument: { a: 1 }
                }
              ],
              id: 1,
              ns
            }
          });
        }
      } else {
        request.reply({ ok: 1 });
      }
    }

    return mock
      .createServer()
      .then(_server => (server = _server))
      .then(() => server.setMessageHandler(messageHandler))
      .then(() => (client = this.configuration.newClient(`mongodb://${server.uri()}`)))
      .then(() => client.connect())
      .then(
        () =>
          (changeStream = client
            .db(db)
            .collection(coll)
            .watch())
      )
      .then(() => changeStream.next())
      .then(
        () => Promise.reject('Expected changeStream to not resume'),
        err => {
          expect(err).to.be.an.instanceOf(MongoError);
          expect(err.hasErrorLabel('NonRetryableChangeStreamError')).to.be.true;
          expect(aggregateCount).to.equal(1);
          expect(getMoreCount).to.equal(1);
        }
      )
      .then(() => teardown(), teardown);
  });

  it('should emit close event after error event', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();
      const closeSpy = sinon.spy();

      client.connect(function(err, client) {
        expect(err).to.not.exist;

        const db = client.db('integration_tests');
        const coll = db.collection('event_test');

        // This will cause an error because the _id will be projected out, which causes the following error:
        // "A change stream document has been received that lacks a resume token (_id)."
        const changeStream = coll.watch([{ $project: { _id: false } }]);

        changeStream.on('change', changeDoc => {
          expect(changeDoc).to.be.null;
        });

        changeStream.on('close', closeSpy);

        changeStream.on('error', err => {
          expect(err).to.exist;
          changeStream.close(() => {
            expect(closeSpy.calledOnce).to.be.true;
            client.close(done);
          });
        });

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          coll.insertOne({ a: 1 }, (err, result) => {
            expect(err).to.not.exist;
            expect(result.insertedCount).to.equal(1);
          });
        });
      });
    }
  });

  describe('should properly handle a changeStream event being processed mid-close', function() {
    let client, coll, changeStream;

    function write() {
      return Promise.resolve()
        .then(() => coll.insertOne({ a: 1 }))
        .then(() => coll.insertOne({ b: 2 }));
    }

    function lastWrite() {
      return coll.insertOne({ c: 3 });
    }

    beforeEach(function() {
      client = this.configuration.newClient();
      return client.connect().then(_client => {
        client = _client;
        coll = client.db(this.configuration.db).collection('tester');
        changeStream = coll.watch();
      });
    });

    afterEach(function() {
      return Promise.resolve()
        .then(() => {
          if (changeStream && !changeStream.isClosed()) {
            return changeStream.close();
          }
        })
        .then(() => {
          if (client) {
            return client.close();
          }
        })
        .then(() => {
          coll = undefined;
          changeStream = undefined;
          client = undefined;
        });
    });

    it('when invoked with promises', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function() {
        function read() {
          return Promise.resolve()
            .then(() => changeStream.next())
            .then(() => changeStream.next())
            .then(() => {
              lastWrite();
              const nextP = changeStream.next();

              return changeStream.close().then(() => nextP);
            });
        }

        return Promise.all([read(), write()]).then(
          () => Promise.reject(new Error('Expected operation to fail with error')),
          err => expect(err.message).to.equal('ChangeStream is closed')
        );
      }
    });

    it('when invoked with callbacks', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function(done) {
        changeStream.next(() => {
          changeStream.next(() => {
            lastWrite();
            changeStream.next(err => {
              let _err = null;
              try {
                expect(err)
                  .property('message')
                  .to.equal('ChangeStream is closed');
              } catch (e) {
                _err = e;
              } finally {
                done(_err);
              }
            });
            changeStream.close();
          });
        });

        write().catch(() => {});
      }
    });

    it('when invoked using eventEmitter API', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function(done) {
        let closed = false;
        const close = _err => {
          if (closed) {
            return;
          }
          closed = true;
          return done(_err);
        };

        let counter = 0;
        changeStream.on('change', () => {
          counter += 1;
          if (counter === 2) {
            changeStream.close();
            setTimeout(() => close());
          } else if (counter >= 3) {
            close(new Error('Should not have received more than 2 events'));
          }
        });
        changeStream.on('error', err => close(err));

        waitForStarted(changeStream, () =>
          write()
            .then(() => lastWrite())
            .catch(() => {})
        );
      }
    });
  });

  describe('resumeToken', function() {
    class MockServerManager {
      constructor(config, commandIterators) {
        this.config = config;
        this.cmdList = new Set(['ismaster', 'endSessions', 'aggregate', 'getMore']);
        this.database = 'test_db';
        this.collection = 'test_coll';
        this.ns = `${this.database}.${this.collection}`;
        this._timestampCounter = 0;
        this.cursorId = new this.config.require.Long('9064341847921713401');
        this.commandIterators = commandIterators;
        this.promise = this.init();
      }

      init() {
        return mock.createServer().then(server => {
          this.server = server;
          this.server.setMessageHandler(request => {
            const doc = request.document;

            const opname = Object.keys(doc)[0];
            let response = { ok: 0 };
            if (this.cmdList.has(opname) && this[opname]) {
              response = this[opname](doc);
            }
            request.reply(this.applyOpTime(response));
          });

          this.client = this.config.newClient(this.mongodbURI, { monitorCommands: true });
          return this.client.connect().then(() => {
            this.apm = { started: [], succeeded: [], failed: [] };
            [
              ['commandStarted', this.apm.started],
              ['commandSucceeded', this.apm.succeeded],
              ['commandFailed', this.apm.failed]
            ].forEach(opts => {
              const eventName = opts[0];
              const target = opts[1];

              this.client.on(eventName, e => {
                if (e.commandName === 'aggregate' || e.commandName === 'getMore') {
                  target.push(e);
                }
              });
            });
          });
        });
      }

      makeChangeStream(options) {
        this.changeStream = this.client
          .db(this.database)
          .collection(this.collection)
          .watch(options);
        this.resumeTokenChangedEvents = [];

        this.changeStream.on('resumeTokenChanged', resumeToken => {
          this.resumeTokenChangedEvents.push({ resumeToken });
        });

        return this.changeStream;
      }

      teardown(e) {
        let promise = Promise.resolve();
        if (this.changeStream) {
          promise = promise.then(() => this.changeStream.close()).catch();
        }
        if (this.client) {
          promise = promise.then(() => this.client.close()).catch();
        }
        return promise.then(function() {
          if (e) {
            throw e;
          }
        });
      }

      ready() {
        return this.promise;
      }

      get mongodbURI() {
        return `mongodb://${this.server.uri()}`;
      }

      // Handlers for specific commands

      ismaster() {
        const uri = this.server.uri();
        return Object.assign({}, mock.DEFAULT_ISMASTER_36, {
          ismaster: true,
          secondary: false,
          me: uri,
          primary: uri,
          setName: 'rs',
          localTime: new Date(),
          ok: 1,
          hosts: [uri]
        });
      }

      endSessions() {
        return { ok: 1 };
      }

      aggregate() {
        let cursor;
        try {
          cursor = this._buildCursor('aggregate', 'firstBatch');
        } catch (e) {
          return { ok: 0, errmsg: e.message };
        }

        return {
          ok: 1,
          cursor
        };
      }

      getMore() {
        let cursor;
        try {
          cursor = this._buildCursor('getMore', 'nextBatch');
        } catch (e) {
          return { ok: 0, errmsg: e.message };
        }
        return {
          ok: 1,
          cursor,
          cursorId: this.cursorId
        };
      }

      // Helpers
      timestamp() {
        return new this.config.require.Timestamp(this._timestampCounter++, Date.now());
      }

      applyOpTime(obj) {
        const operationTime = this.timestamp();

        return Object.assign({}, obj, {
          $clusterTime: { clusterTime: operationTime },
          operationTime
        });
      }

      _buildCursor(type, batchKey) {
        const config = this.commandIterators[type].next().value;
        if (!config) {
          throw new Error('no more config for ' + type);
        }

        const batch = Array.from({ length: config.numDocuments || 0 }).map(() =>
          this.changeEvent()
        );
        const cursor = {
          [batchKey]: batch,
          id: this.cursorId,
          ns: this.ns
        };
        if (config.postBatchResumeToken) {
          cursor.postBatchResumeToken = this.resumeToken();
        }
        return cursor;
      }

      changeEvent(operationType, fullDocument) {
        fullDocument = fullDocument || {};
        return {
          _id: this.resumeToken(),
          operationType,
          ns: {
            db: this.database,
            coll: this.collection
          },
          fullDocument
        };
      }

      resumeToken() {
        return {
          ts: this.timestamp(),
          ns: this.namespace,
          _id: new this.config.require.ObjectId()
        };
      }
    }

    // 11. For a ChangeStream under these conditions:
    //   Running against a server >=4.0.7.
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the postBatchResumeToken from the current command response.
    describe('for emptied batch on server >= 4.0.7', function() {
      it('must return the postBatchResumeToken from the current command response', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: true };
          })(),
          getMore: (function*() {
            yield { numDocuments: 1, postBatchResumeToken: true };
          })()
        });

        return manager
          .ready()
          .then(() => {
            return manager.makeChangeStream().next();
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            const tokens = manager.resumeTokenChangedEvents.map(e => e.resumeToken);
            const successes = manager.apm.succeeded.map(e => {
              try {
                return e.reply.cursor;
              } catch (e) {
                return {};
              }
            });

            expect(successes).to.have.a.lengthOf(2);
            expect(successes[0]).to.have.a.property('postBatchResumeToken');
            expect(successes[1]).to.have.a.property('postBatchResumeToken');
            expect(successes[1]).to.have.a.nested.property('nextBatch[0]._id');

            expect(tokens).to.have.a.lengthOf(2);
            expect(tokens[0]).to.deep.equal(successes[0].postBatchResumeToken);
            expect(tokens[1])
              .to.deep.equal(successes[1].postBatchResumeToken)
              .and.to.not.deep.equal(successes[1].nextBatch[0]._id);
          });
      });
    });

    // 12. For a ChangeStream under these conditions:
    //   Running against a server <4.0.7.
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the _id of the last document returned if one exists.
    //   getResumeToken must return resumeAfter from the initial aggregate if the option was specified.
    //   If ``resumeAfter`` was not specified, the ``getResumeToken`` result must be empty.
    describe('for emptied batch on server <= 4.0.7', function() {
      it('must return the _id of the last document returned if one exists', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 1, postBatchResumeToken: false };
          })()
        });

        return manager
          .ready()
          .then(() => manager.makeChangeStream().next())
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            const tokens = manager.resumeTokenChangedEvents.map(e => e.resumeToken);
            const successes = manager.apm.succeeded.map(e => {
              try {
                return e.reply.cursor;
              } catch (e) {
                return {};
              }
            });

            expect(successes).to.have.a.lengthOf(2);
            expect(successes[1]).to.have.a.nested.property('nextBatch[0]._id');

            expect(tokens).to.have.a.lengthOf(1);
            expect(tokens[0]).to.deep.equal(successes[1].nextBatch[0]._id);
          });
      });
      it('must return resumeAfter from the initial aggregate if the option was specified', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;
        const resumeAfter = manager.resumeToken();

        return manager
          .ready()
          .then(() => {
            return new Promise(resolve => {
              const changeStream = manager.makeChangeStream({ resumeAfter });
              let counter = 0;
              changeStream.cursor.on('response', () => {
                if (counter === 1) {
                  token = changeStream.resumeToken;
                  resolve();
                }
                counter += 1;
              });

              // Note: this is expected to fail
              changeStream.next().catch(() => {});
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.deep.equal(resumeAfter);
          });
      });
      it('must be empty if resumeAfter options was not specified', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;

        return manager
          .ready()
          .then(() => {
            return new Promise(resolve => {
              const changeStream = manager.makeChangeStream();
              let counter = 0;
              changeStream.cursor.on('response', () => {
                if (counter === 1) {
                  token = changeStream.resumeToken;
                  resolve();
                }
                counter += 1;
              });

              // Note: this is expected to fail
              changeStream.next().catch(() => {});
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.not.exist;
          });
      });
    });

    // 13. For a ChangeStream under these conditions:
    //   The batch is not empty.
    //   The batch has been iterated up to but not including the last element.
    // Expected result:
    //   getResumeToken must return the _id of the previous document returned.
    describe('for non-empty batch iterated up to but not including the last element', function() {
      it('must return the _id of the previous document returned', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 2, postBatchResumeToken: true };
          })(),
          getMore: (function*() {})()
        });

        return manager
          .ready()
          .then(() => {
            return manager.makeChangeStream().next();
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            const tokens = manager.resumeTokenChangedEvents.map(e => e.resumeToken);
            const successes = manager.apm.succeeded.map(e => {
              try {
                return e.reply.cursor;
              } catch (e) {
                return {};
              }
            });

            expect(successes).to.have.a.lengthOf(1);
            expect(successes[0]).to.have.a.nested.property('firstBatch[0]._id');
            expect(successes[0]).to.have.a.property('postBatchResumeToken');

            expect(tokens).to.have.a.lengthOf(1);
            expect(tokens[0])
              .to.deep.equal(successes[0].firstBatch[0]._id)
              .and.to.not.deep.equal(successes[0].postBatchResumeToken);
          });
      });
    });

    // 14. For a ChangeStream under these conditions:
    //   The batch is not empty.
    //   The batch hasn’t been iterated at all.
    //   Only the initial aggregate command has been executed.
    // Expected result:
    //   getResumeToken must return startAfter from the initial aggregate if the option was specified.
    //   getResumeToken must return resumeAfter from the initial aggregate if the option was specified.
    //   If neither the startAfter nor resumeAfter options were specified, the getResumeToken result must be empty.
    describe('for non-empty non-iterated batch where only the initial aggregate command has been executed', function() {
      it('must return startAfter from the initial aggregate if the option was specified', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;
        const startAfter = manager.resumeToken();
        const resumeAfter = manager.resumeToken();

        return manager
          .ready()
          .then(() => {
            return new Promise(resolve => {
              const changeStream = manager.makeChangeStream({ startAfter, resumeAfter });
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              // Note: this is expected to fail
              changeStream.next().catch(() => {});
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token)
              .to.deep.equal(startAfter)
              .and.to.not.deep.equal(resumeAfter);
          });
      });
      it('must return resumeAfter from the initial aggregate if the option was specified', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;
        const resumeAfter = manager.resumeToken();

        return manager
          .ready()
          .then(() => {
            return new Promise(resolve => {
              const changeStream = manager.makeChangeStream({ resumeAfter });
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              // Note: this is expected to fail
              changeStream.next().catch(() => {});
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.deep.equal(resumeAfter);
          });
      });
      it('must be empty if neither the startAfter nor resumeAfter options were specified', function() {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function*() {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;

        return manager
          .ready()
          .then(() => {
            return new Promise(resolve => {
              const changeStream = manager.makeChangeStream();
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              // Note: this is expected to fail
              changeStream.next().catch(() => {});
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.not.exist;
          });
      });
    });
  });

  describe('tryNext', function() {
    it('should return null on single iteration of empty cursor', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function() {
        return withTempDb(
          'testTryNext',
          { w: 'majority' },
          this.configuration.newClient(),
          db => done => {
            const changeStream = db.collection('test').watch();
            tryNext(changeStream, (err, doc) => {
              expect(err).to.not.exist;
              expect(doc).to.not.exist;

              changeStream.close(done);
            });
          }
        );
      }
    });

    it('should iterate a change stream until first empty batch', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function() {
        return withTempDb(
          'testTryNext',
          { w: 'majority' },
          this.configuration.newClient(),
          db => done => {
            const collection = db.collection('test');
            const changeStream = collection.watch();
            waitForStarted(changeStream, () => {
              collection.insertOne({ a: 42 }, err => {
                expect(err).to.not.exist;

                collection.insertOne({ b: 24 }, err => {
                  expect(err).to.not.exist;
                });
              });
            });

            tryNext(changeStream, (err, doc) => {
              expect(err).to.not.exist;
              expect(doc).to.exist;

              tryNext(changeStream, (err, doc) => {
                expect(err).to.not.exist;
                expect(doc).to.exist;

                tryNext(changeStream, (err, doc) => {
                  expect(err).to.not.exist;
                  expect(doc).to.not.exist;

                  changeStream.close(done);
                });
              });
            });
          }
        );
      }
    });
  });

  describe('startAfter', function() {
    let client;
    let coll;
    let startAfter;

    function recordEvent(events, e) {
      if (e.commandName !== 'aggregate') return;
      events.push({ $changeStream: e.command.pipeline[0].$changeStream });
    }

    beforeEach(function(done) {
      const configuration = this.configuration;
      client = configuration.newClient({ monitorCommands: true });
      client.connect(err => {
        expect(err).to.not.exist;
        coll = client.db('integration_tests').collection('setupAfterTest');
        const changeStream = coll.watch();
        waitForStarted(changeStream, () => {
          coll.insertOne({ x: 1 }, { w: 'majority', j: true }, err => {
            expect(err).to.not.exist;

            coll.drop(err => {
              expect(err).to.not.exist;
            });
          });
        });

        changeStream.on('change', change => {
          if (change.operationType === 'invalidate') {
            startAfter = change._id;
            changeStream.close(done);
          }
        });
      });
    });

    afterEach(function(done) {
      client.close(done);
    });

    it('should work with events', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function(done) {
        const changeStream = coll.watch([], { startAfter });
        coll.insertOne({ x: 2 }, { w: 'majority', j: true }, err => {
          expect(err).to.not.exist;
          changeStream.once('change', change => {
            expect(change).to.containSubset({
              operationType: 'insert',
              fullDocument: { x: 2 }
            });
            changeStream.close(done);
          });
        });
      }
    });

    it('should work with callbacks', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function(done) {
        const changeStream = coll.watch([], { startAfter });
        coll.insertOne({ x: 2 }, { w: 'majority', j: true }, err => {
          expect(err).to.not.exist;
          exhaust(changeStream, (err, bag) => {
            expect(err).to.not.exist;
            const finalOperation = bag.pop();
            expect(finalOperation).to.containSubset({
              operationType: 'insert',
              fullDocument: { x: 2 }
            });
            changeStream.close(done);
          });
        });
      }
    });

    // 17. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has not received any results yet
    // - MUST include a startAfter option
    // - MUST NOT include a resumeAfter option
    // when resuming a change stream.
    it('$changeStream without results must include startAfter and not resumeAfter', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function(done) {
        const events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });
        changeStream.once('change', change => {
          expect(change).to.containSubset({
            operationType: 'insert',
            fullDocument: { x: 2 }
          });
          expect(events)
            .to.be.an('array')
            .with.lengthOf(3);
          expect(events[0]).nested.property('$changeStream.startAfter').to.exist;
          expect(events[1]).to.equal('error');
          expect(events[2]).nested.property('$changeStream.startAfter').to.exist;
          changeStream.close(done);
        });

        waitForStarted(changeStream, () => {
          triggerResumableError(changeStream, () => events.push('error'));
          coll.insertOne({ x: 2 }, { w: 'majority', j: true }, err => {
            expect(err).to.not.exist;
          });
        });
      }
    });

    // 18. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has received at least one result
    // - MUST include a resumeAfter option
    // - MUST NOT include a startAfter option
    // when resuming a change stream.
    it('$changeStream with results must include resumeAfter and not startAfter', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function(done) {
        let events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });

        changeStream.on('change', change => {
          events.push({ change: { insert: { x: change.fullDocument.x } } });
          switch (change.fullDocument.x) {
            case 2:
              // only events after this point are relevant to this test
              events = [];
              triggerResumableError(changeStream, () => events.push('error'));
              break;
            case 3:
              expect(events)
                .to.be.an('array')
                .with.lengthOf(3);
              expect(events[0]).to.equal('error');
              expect(events[1]).nested.property('$changeStream.resumeAfter').to.exist;
              expect(events[2]).to.eql({ change: { insert: { x: 3 } } });
              changeStream.close(done);
              break;
          }
        });
        waitForStarted(changeStream, () =>
          coll.insertOne({ x: 2 }, { w: 'majority', j: true }, err => {
            expect(err).to.not.exist;
            coll.insertOne({ x: 3 }, { w: 'majority', j: true }, err => {
              expect(err).to.not.exist;
            });
          })
        );
      }
    });
  });
});

describe('Change Stream Resume Error Tests', function() {
  function withChangeStream(testName, callback) {
    return function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db('changeStreamResumErrorTest');
        db.createCollection(testName, (err, collection) => {
          expect(err).to.not.exist;
          const changeStream = collection.watch();
          callback(collection, changeStream, () =>
            changeStream.close(() => collection.drop(() => client.close(done)))
          );
        });
      });
    };
  }
  it('(events) should continue iterating after a resumable error', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withChangeStream('resumeErrorEvents', (collection, changeStream, done) => {
      const docs = [];
      changeStream.on('change', change => {
        expect(change).to.exist;
        docs.push(change);
        if (docs.length === 2) {
          expect(docs[0]).to.containSubset({
            operationType: 'insert',
            fullDocument: { a: 42 }
          });
          expect(docs[1]).to.containSubset({
            operationType: 'insert',
            fullDocument: { b: 24 }
          });
          done();
        }
      });
      waitForStarted(changeStream, () => {
        collection.insertOne({ a: 42 }, err => {
          expect(err).to.not.exist;
          triggerResumableError(changeStream, 1000, () => {
            collection.insertOne({ b: 24 }, err => {
              expect(err).to.not.exist;
            });
          });
        });
      });
    })
  });

  it('(callback) hasNext and next should work after a resumable error', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withChangeStream('resumeErrorIterator', (collection, changeStream, done) => {
      waitForStarted(changeStream, () => {
        collection.insertOne({ a: 42 }, err => {
          expect(err).to.not.exist;
          triggerResumableError(changeStream, 250, () => {
            changeStream.hasNext((err1, hasNext) => {
              expect(err1).to.not.exist;
              expect(hasNext).to.be.true;
              changeStream.next((err, change) => {
                expect(err).to.not.exist;
                expect(change).to.containSubset({
                  operationType: 'insert',
                  fullDocument: { b: 24 }
                });
                done();
              });
            });
            collection.insertOne({ b: 24 });
          });
        });
      });
      changeStream.hasNext((err, hasNext) => {
        expect(err).to.not.exist;
        expect(hasNext).to.be.true;
        changeStream.next((err, change) => {
          expect(err).to.not.exist;
          expect(change).to.containSubset({
            operationType: 'insert',
            fullDocument: { a: 42 }
          });
        });
      });
    })
  });
});
