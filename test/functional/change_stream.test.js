'use strict';
const assert = require('assert');
const { Transform, PassThrough } = require('stream');
const { MongoNetworkError, MongoDriverError, MongoChangeStreamError } = require('../../src/error');
const { delay, setupDatabase, withClient, withCursor } = require('./shared');
const co = require('co');
const mock = require('../tools/mock');
const { EventCollector } = require('../tools/utils');
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { ObjectId, Timestamp, Long, ReadPreference } = require('../../src');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

chai.use(require('chai-subset'));

function withChangeStream(dbName, collectionName, callback) {
  if (arguments.length === 1) {
    callback = dbName;
    dbName = undefined;
  } else if (arguments.length === 2) {
    callback = collectionName;
    collectionName = dbName;
    dbName = undefined;
  }

  dbName = dbName || 'changestream_integration_test';
  collectionName = collectionName || 'test';

  return withClient((client, done) => {
    const db = client.db(dbName);
    db.dropCollection(collectionName, () => {
      db.createCollection(
        collectionName,
        { writeConcern: { w: 'majority' } },
        (err, collection) => {
          if (err) return done(err);
          withCursor(
            collection.watch(),
            (cursor, done) => callback(collection, cursor, done),
            err => collection.drop(dropErr => done(err || dropErr))
          );
        }
      );
    });
  });
}

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
  stub.callsFake(function () {
    stub.wrappedMethod.call(this);
    stub.restore();
    onClose();
  });

  function triggerError() {
    const cursorStream = changeStream.cursorStream;
    if (cursorStream) {
      cursorStream.emit('error', new MongoNetworkError('error triggered from test'));
      return;
    }

    const nextStub = sinon.stub(changeStream.cursor, 'next').callsFake(function (callback) {
      callback(new MongoNetworkError('error triggered from test'));
      nextStub.restore();
    });

    changeStream.next(() => {});
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
 * @param {Function} callback
 */
function waitForStarted(changeStream, callback) {
  const timeout = setTimeout(() => {
    throw new MongoChangeStreamError('Change stream never started');
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
 * @param {Function} callback
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
const pipeline = [
  { $addFields: { addedField: 'This is a field added using $addFields' } },
  { $project: { documentKey: false } },
  { $addFields: { comment: 'The documentKey field has been projected out of this document.' } }
];

describe('Change Streams', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests']);
  });

  beforeEach(function () {
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

  it('should close the listeners after the cursor is closed', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      let closed = false;
      function close(err) {
        if (closed) return;
        closed = true;
        done(err);
      }

      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const coll = client.db('integration_tests').collection('listenertest');
        const changeStream = coll.watch();
        this.defer(() => changeStream.close());

        changeStream.on('change', () => {
          expect(changeStream.cursorStream.listenerCount('data')).to.equal(1);
          changeStream.close(err => {
            expect(changeStream.cursorStream).to.not.exist;
            expect(err).to.not.exist;
            close(err);
          });
        });

        waitForStarted(changeStream, () => this.defer(coll.insertOne({ x: 1 })));
        changeStream.on('error', err => close(err));
      });
    }
  });

  it('should create a ChangeStream on a collection and emit `change` events', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const collection = client.db('integration_tests').collection('docsDataEvent');
        const changeStream = collection.watch(pipeline);
        this.defer(() => changeStream.close());

        const collector = new EventCollector(changeStream, ['init', 'change']);
        waitForStarted(changeStream, () => {
          // Trigger the first database event
          collection.insertOne({ d: 4 }, err => {
            expect(err).to.not.exist;
            // Trigger the second database event
            collection.updateOne({ d: 4 }, { $inc: { d: 2 } }, err => {
              expect(err).to.not.exist;

              collector.waitForEvent('change', 2, (err, changes) => {
                expect(err).to.not.exist;
                expect(changes).to.have.length(2);
                expect(changes[0]).to.not.have.property('documentKey');
                expect(changes[0]).to.containSubset({
                  operationType: 'insert',
                  fullDocument: { d: 4 },
                  ns: {
                    db: 'integration_tests',
                    coll: 'docsDataEvent'
                  },
                  comment: 'The documentKey field has been projected out of this document.'
                });

                expect(changes[1]).to.containSubset({
                  operationType: 'update',
                  updateDescription: {
                    updatedFields: { d: 6 }
                  }
                });

                done();
              });
            });
          });
        });
      });
    }
  });

  it(
    'should create a ChangeStream on a collection and get change events through imperative callback form',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient();

        client.connect((err, client) => {
          expect(err).to.not.exist;
          this.defer(() => client.close());

          const collection = client.db('integration_tests').collection('docsCallback');
          const changeStream = collection.watch(pipeline);
          this.defer(() => changeStream.close());

          // Fetch the change notification
          changeStream.hasNext((err, hasNext) => {
            expect(err).to.not.exist;

            assert.equal(true, hasNext);
            changeStream.next((err, change) => {
              expect(err).to.not.exist;
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
              collection.updateOne({ e: 5 }, { $inc: { e: 2 } }, err => {
                expect(err).to.not.exist;
                changeStream.hasNext((err, hasNext) => {
                  expect(err).to.not.exist;
                  assert.equal(true, hasNext);
                  changeStream.next((err, change) => {
                    expect(err).to.not.exist;
                    assert.equal(change.operationType, 'update');

                    done();
                  });
                });
              });
            });
          });

          // Trigger the first database event
          // NOTE: this needs to be triggered after the changeStream call so
          // that the cursor is run
          this.defer(collection.insertOne({ e: 5 }));
        });
      }
    }
  );

  it('should support creating multiple simultaneous ChangeStreams', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const collection1 = database.collection('simultaneous1');
        const collection2 = database.collection('simultaneous2');

        const changeStream1 = collection1.watch([{ $addFields: { changeStreamNumber: 1 } }]);
        this.defer(() => changeStream1.close());
        const changeStream2 = collection2.watch([{ $addFields: { changeStreamNumber: 2 } }]);
        this.defer(() => changeStream2.close());
        const changeStream3 = collection2.watch([{ $addFields: { changeStreamNumber: 3 } }]);
        this.defer(() => changeStream3.close());

        setTimeout(() => {
          this.defer(collection1.insert({ a: 1 }).then(() => collection2.insert({ a: 1 })));
        }, 50);

        Promise.resolve()
          .then(() =>
            Promise.all([changeStream1.hasNext(), changeStream2.hasNext(), changeStream3.hasNext()])
          )
          .then(function (hasNexts) {
            // Check all the Change Streams have a next item
            assert.ok(hasNexts[0]);
            assert.ok(hasNexts[1]);
            assert.ok(hasNexts[2]);

            return Promise.all([changeStream1.next(), changeStream2.next(), changeStream3.next()]);
          })
          .then(function (changes) {
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
          })
          .then(
            () => done(),
            err => done(err)
          );
      });
    }
  });

  it('should properly close ChangeStream cursor', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database.collection('changeStreamCloseTest').watch(pipeline);
        this.defer(() => changeStream.close());

        assert.equal(changeStream.closed, false);
        assert.equal(changeStream.cursor.closed, false);

        changeStream.close(err => {
          expect(err).to.not.exist;

          // Check the cursor is closed
          assert.equal(changeStream.closed, true);
          assert.ok(!changeStream.cursor);
          done();
        });
      });
    }
  });

  it(
    'should error when attempting to create a ChangeStream with a forbidden aggregation pipeline stage',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient();

        client.connect((err, client) => {
          expect(err).to.not.exist;
          this.defer(() => client.close());

          const forbiddenStage = {};
          const forbiddenStageName = '$alksdjfhlaskdfjh';
          forbiddenStage[forbiddenStageName] = 2;

          const database = client.db('integration_tests');
          const changeStream = database.collection('forbiddenStageTest').watch([forbiddenStage]);
          this.defer(() => changeStream.close());

          changeStream.next(err => {
            assert.ok(err);
            assert.ok(err.message);
            assert.ok(
              err.message.indexOf(`Unrecognized pipeline stage name: '${forbiddenStageName}'`) > -1
            );

            done();
          });
        });
      }
    }
  );

  it('should cache the change stream resume token using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database.collection('cacheResumeTokenCallback').watch(pipeline);
        this.defer(() => changeStream.close());

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(database.collection('cacheResumeTokenCallback').insert({ b: 2 }));
        });

        // Fetch the change notification
        changeStream.hasNext(function (err, hasNext) {
          expect(err).to.not.exist;
          assert.equal(true, hasNext);
          changeStream.next(function (err, change) {
            expect(err).to.not.exist;
            assert.deepEqual(changeStream.resumeToken, change._id);
            done();
          });
        });
      });
    }
  });

  it('should cache the change stream resume token using promises', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(() => {
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database.collection('cacheResumeTokenPromise').watch(pipeline);
        this.defer(() => changeStream.close());

        // trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(database.collection('cacheResumeTokenPromise').insert({ b: 2 }));
        });

        return changeStream
          .hasNext()
          .then(hasNext => {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(change => {
            assert.deepEqual(changeStream.resumeToken, change._id);
          });
      });
    }
  });

  it('should cache the change stream resume token using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const db = client.db('integration_tests');
        const changeStream = db.collection('cacheResumeTokenListener').watch(pipeline);
        this.defer(() => changeStream.close());

        const collector = new EventCollector(changeStream, ['change']);
        waitForStarted(changeStream, () => {
          // Trigger the first database event
          db.collection('cacheResumeTokenListener').insert({ b: 2 }, (err, result) => {
            expect(err).to.not.exist;
            expect(result).property('insertedCount').to.equal(1);

            collector.waitForEvent('change', (err, events) => {
              expect(err).to.not.exist;
              expect(changeStream).property('resumeToken').to.eql(events[0]._id);

              done();
            });
          });
        });
      });
    }
  });

  it(
    'should error if resume token projected out of change stream document using imperative callback form',
    {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient();

        client.connect((err, client) => {
          expect(err).to.not.exist;
          this.defer(() => client.close());

          const database = client.db('integration_tests');
          const changeStream = database
            .collection('resumetokenProjectedOutCallback')
            .watch([{ $project: { _id: false } }]);
          this.defer(() => changeStream.close());

          // Trigger the first database event
          waitForStarted(changeStream, () => {
            this.defer(database.collection('resumetokenProjectedOutCallback').insert({ b: 2 }));
          });

          // Fetch the change notification
          changeStream.next(err => {
            expect(err).to.exist;
            done();
          });
        });
      }
    }
  );

  it('should error if resume token projected out of change stream document using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const db = client.db('integration_tests');
        const collection = db.collection('resumetokenProjectedOutListener');
        const changeStream = collection.watch([{ $project: { _id: false } }]);
        this.defer(() => changeStream.close());

        const collector = new EventCollector(changeStream, ['change', 'error']);
        waitForStarted(changeStream, () => {
          collection.insert({ b: 2 }, (err, result) => {
            expect(err).to.not.exist;
            expect(result).property('insertedCount').to.equal(1);

            collector.waitForEvent('error', (err, events) => {
              expect(err).to.not.exist;
              expect(events).to.have.lengthOf.at.least(1);
              done();
            });
          });
        });
      });
    }
  });

  it('should invalidate change stream on collection rename using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database
          .collection('invalidateListeners')
          .watch(pipeline, { batchSize: 1 });
        this.defer(() => changeStream.close());

        // Attach first event listener
        changeStream.once('change', change => {
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
          changeStream.on('change', change => {
            if (change.operationType === 'invalidate') {
              // now expect the server to close the stream
              changeStream.once('close', () => done());
            }
          });

          // Trigger the second database event
          setTimeout(() => {
            this.defer(
              database.collection('invalidateListeners').rename('renamedDocs', { dropTarget: true })
            );
          }, 250);
        });

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(database.collection('invalidateListeners').insert({ a: 1 }));
        });
      });
    }
  });

  it('should invalidate change stream on database drop using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database.collection('invalidateCallback').watch(pipeline);
        this.defer(() => changeStream.close());

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(database.collection('invalidateCallback').insert({ a: 1 }));
        });

        changeStream.next((err, change) => {
          expect(err).to.not.exist;
          assert.equal(change.operationType, 'insert');

          database.dropDatabase(err => {
            expect(err).to.not.exist;

            function completeStream() {
              changeStream.hasNext(function (err, hasNext) {
                expect(err).to.not.exist;
                assert.equal(hasNext, false);
                assert.equal(changeStream.closed, true);
                done();
              });
            }

            function checkInvalidate() {
              changeStream.next(function (err, change) {
                expect(err).to.not.exist;

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

  it('should invalidate change stream on collection drop using promises', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      function checkInvalidate(changeStream) {
        return changeStream.next().then(change => {
          if (change.operationType === 'invalidate') {
            return Promise.resolve();
          }

          return checkInvalidate(changeStream);
        });
      }

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const changeStream = database
          .collection('invalidateCollectionDropPromises')
          .watch(pipeline);
        this.defer(() => changeStream.close());

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(database.collection('invalidateCollectionDropPromises').insert({ a: 1 }));
        });

        return changeStream
          .next()
          .then(function (change) {
            assert.equal(change.operationType, 'insert');
            return database.dropCollection('invalidateCollectionDropPromises');
          })
          .then(() => checkInvalidate(changeStream))
          .then(() => changeStream.hasNext())
          .then(function (hasNext) {
            assert.equal(hasNext, false);
            assert.equal(changeStream.closed, true);
            done();
          });
      });
    }
  });

  it.skip('should return MongoNetworkError after first retry attempt fails using promises', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.6'
      }
    },

    test: function (done) {
      const configuration = this.configuration;

      // Contain mock server
      let primaryServer = null;

      // Default message fields
      const defaultFields = {
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

      co(function* () {
        primaryServer = yield mock.createServer(32000, 'localhost');

        primaryServer.setMessageHandler(request => {
          const doc = request.document;

          if (doc.ismaster || doc.hello) {
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

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const database = client.db('integration_tests');
        const collection = database.collection('MongoNetworkErrorTestPromises');
        const changeStream = collection.watch(pipeline);

        return changeStream
          .next()
          .then(function () {
            // We should never execute this line because calling changeStream.next() should throw an error
            throw new MongoChangeStreamError(
              'ChangeStream.next() returned a change document but it should have returned a MongoNetworkError'
            );
          })
          .catch(err => {
            assert.ok(
              err instanceof MongoNetworkError,
              'error was not instance of MongoNetworkError'
            );
            assert.ok(err.message);
            assert.ok(err.message.indexOf('closed') > -1);

            changeStream.close(err => {
              expect(err).to.not.exist;
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

  it.skip('should return MongoNetworkError after first retry attempt fails using callbacks', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.6'
      }
    },
    test: function (done) {
      const configuration = this.configuration;

      // Contain mock server
      let primaryServer = null;

      // Default message fields
      const defaultFields = {
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
      let die = false;

      co(function* () {
        primaryServer = yield mock.createServer(32000, 'localhost');

        primaryServer.setMessageHandler(request => {
          const doc = request.document;

          if (die) {
            request.connection.destroy();
          } else if (doc.ismaster || doc.hello) {
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
        socketTimeoutMS: 500
      });

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const database = client.db('integration_tests');
        const collection = database.collection('MongoNetworkErrorTestPromises');
        const changeStream = collection.watch(pipeline);

        changeStream.next(function (err, change) {
          assert.ok(err instanceof MongoNetworkError);
          assert.ok(err.message);
          assert.ok(err.message.indexOf('timed out') > -1);

          assert.equal(
            change,
            null,
            'ChangeStream.next() returned a change document but it should have returned a MongoNetworkError'
          );

          changeStream.close(err => {
            expect(err).to.not.exist;
            changeStream.close();

            client.close(() => mock.cleanup(() => done()));
          });
        });
      });
    }
  });

  it.skip('should resume Change Stream when a resumable error is encountered', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.6'
      }
    },
    test: function (done) {
      const configuration = this.configuration;

      // Contain mock server
      let primaryServer = null;

      // Default message fields
      const defaultFields = {
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
      let callsToGetMore = 0;

      // Boot the mock
      co(function* () {
        primaryServer = yield mock.createServer(32000, 'localhost');

        let counter = 0;
        primaryServer.setMessageHandler(request => {
          const doc = request.document;

          // Create a server that responds to the initial aggregation to connect to the server, but not to subsequent getMore requests
          if (doc.ismaster || doc.hello) {
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
        socketTimeoutMS: 500
      });

      client
        .connect()
        .then(client => {
          const database = client.db('integration_tests');
          const collection = database.collection('MongoNetworkErrorTestPromises');
          const changeStream = collection.watch(pipeline);

          return changeStream
            .next()
            .then(function (change) {
              assert.ok(change);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.fullDocument.counter, 0);

              // Add a tag to the cursor
              changeStream.cursor.track = 1;

              return changeStream.next();
            })
            .then(function (change) {
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

  it('should resume from point in time using user-provided resumeAfter', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const collection = database.collection('resumeAfterTest2');

        let firstChangeStream, secondChangeStream;

        let resumeToken;
        const docs = [{ a: 0 }, { a: 1 }, { a: 2 }];

        firstChangeStream = collection.watch(pipeline);
        this.defer(() => firstChangeStream.close());

        // Trigger the first database event
        waitForStarted(firstChangeStream, () => {
          this.defer(
            collection
              .insert(docs[0])
              .then(() => collection.insertOne(docs[1]))
              .then(() => collection.insertOne(docs[2]))
          );
        });

        return firstChangeStream
          .hasNext()
          .then(hasNext => {
            assert.equal(true, hasNext);
            return firstChangeStream.next();
          })
          .then(change => {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[0].a);

            // Save the resumeToken
            resumeToken = change._id;
            return firstChangeStream.next();
          })
          .then(change => {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[1].a);

            return firstChangeStream.next();
          })
          .then(change => {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[2].a);

            return firstChangeStream.close();
          })
          .then(() => {
            secondChangeStream = collection.watch(pipeline, {
              resumeAfter: resumeToken
            });
            this.defer(() => secondChangeStream.close());

            return delay(200);
          })
          .then(() => secondChangeStream.hasNext())
          .then(hasNext => {
            assert.equal(true, hasNext);
            return secondChangeStream.next();
          })
          .then(change => {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[1].a);
            return secondChangeStream.next();
          })
          .then(change => {
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.a, docs[2].a);
            return secondChangeStream.close();
          });
      });
    }
  });

  it('should support full document lookup', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const collection = database.collection('fullDocumentLookup');
        const changeStream = collection.watch(pipeline, {
          fullDocument: 'updateLookup'
        });
        this.defer(() => changeStream.close());

        waitForStarted(changeStream, () => {
          this.defer(collection.insert({ f: 128 }));
        });

        return changeStream
          .hasNext()
          .then(function (hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function (change) {
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
          .then(function () {
            return changeStream.next();
          })
          .then(function (change) {
            assert.equal(change.operationType, 'update');

            // Check the correct fullDocument is present
            assert.ok(change.fullDocument);
            assert.equal(change.fullDocument.f, 128);
            assert.equal(change.fullDocument.c, 2);
          });
      });
    }
  });

  it('should support full document lookup with deleted documents', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const collection = database.collection('fullLookupTest');
        const changeStream = collection.watch(pipeline, {
          fullDocument: 'updateLookup'
        });
        this.defer(() => changeStream.close());

        // Trigger the first database event
        waitForStarted(changeStream, () => {
          this.defer(collection.insert({ i: 128 }).then(() => collection.deleteOne({ i: 128 })));
        });

        return changeStream
          .hasNext()
          .then(function (hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function (change) {
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
          .then(() => changeStream.hasNext())
          .then(function (hasNext) {
            assert.equal(true, hasNext);
            return changeStream.next();
          })
          .then(function (change) {
            assert.equal(change.operationType, 'delete');
            assert.equal(change.lookedUpDocument, null);
          });
      });
    }
  });

  it('should create Change Streams with correct read preferences', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        this.defer(() => client.close());

        // should get preference from database
        const database = client.db('integration_tests', {
          readPreference: ReadPreference.PRIMARY_PREFERRED
        });

        const changeStream0 = database.collection('docs0').watch(pipeline);
        this.defer(() => changeStream0.close());

        assert.deepEqual(
          changeStream0.cursor.readPreference.preference,
          ReadPreference.PRIMARY_PREFERRED
        );

        // should get preference from collection
        const collection = database.collection('docs1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });

        const changeStream1 = collection.watch(pipeline);
        assert.deepEqual(
          changeStream1.cursor.readPreference.preference,
          ReadPreference.SECONDARY_PREFERRED
        );
        this.defer(() => changeStream1.close());

        // should get preference from Change Stream options
        const changeStream2 = collection.watch(pipeline, {
          readPreference: ReadPreference.NEAREST
        });
        this.defer(() => changeStream2.close());

        assert.deepEqual(changeStream2.cursor.readPreference.preference, ReadPreference.NEAREST);
      });
    }
  });

  it('should support piping of Change Streams', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },

    test: function (done) {
      const configuration = this.configuration;
      const stream = require('stream');
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const database = client.db('integration_tests');
        const collection = database.collection('pipeTest');
        const changeStream = collection.watch(pipeline);
        this.defer(() => changeStream.close());

        const outStream = new stream.PassThrough({ objectMode: true });

        // Make a stream transforming to JSON and piping to the file
        changeStream.stream({ transform: JSON.stringify }).pipe(outStream);

        outStream
          .on('data', data => {
            try {
              const parsedEvent = JSON.parse(data);
              assert.equal(parsedEvent.fullDocument.a, 1);
              done();
            } catch (e) {
              done(e);
            }
          })
          .on('error', done);

        waitForStarted(changeStream, () => {
          this.defer(collection.insert({ a: 1 }));
        });
      });
    }
  });

  it.skip('should resume piping of Change Streams when a resumable error is encountered', {
    // TODO(2704)
    metadata: {
      requires: {
        os: '!win32', // (fs.watch isn't reliable on win32)
        generators: true,
        topology: 'single',
        mongodb: '>=3.6'
      }
    },
    test: function (done) {
      const filename = path.join(os.tmpdir(), '_nodemongodbnative_resumepipe.txt');
      this.defer(() => fs.unlinkSync(filename));
      const configuration = this.configuration;

      // Default message fields
      const defaultFields = {
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

      mock.createServer(32000, 'localhost').then(primaryServer => {
        this.defer(() => mock.cleanup());
        let counter = 0;
        primaryServer.setMessageHandler(request => {
          const doc = request.document;

          // Create a server that responds to the initial aggregation to connect to the server, but not to subsequent getMore requests
          if (doc.ismaster || doc.hello) {
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
          socketTimeoutMS: 500
        });

        client.connect((err, client) => {
          expect(err).to.not.exist;
          this.defer(() => client.close());

          const database = client.db('integration_tests5');
          const collection = database.collection('MongoNetworkErrorTestPromises');
          const changeStream = collection.watch(pipeline);

          const outStream = fs.createWriteStream(filename, { flags: 'w' });
          this.defer(() => outStream.close());

          changeStream
            .stream({ transform: change => JSON.stringify(change) + '\n' })
            .pipe(outStream);
          this.defer(() => changeStream.close());
          // Listen for changes to the file
          const watcher = fs.watch(filename, eventType => {
            this.defer(() => watcher.close());
            expect(eventType).to.equal('change');

            const fileContents = fs.readFileSync(filename, 'utf8');
            const parsedFileContents = JSON.parse(fileContents.split(/\n/)[0]);
            expect(parsedFileContents).to.have.nested.property('fullDocument.a', 1);
            done();
          });
        });
      });
    }
  });

  it('should support piping of Change Streams through multiple pipes', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), { maxPoolSize: 1 });

      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const cipher = crypto.createCipher('aes192', 'a password');
        const decipher = crypto.createDecipher('aes192', 'a password');

        const database = client.db('integration_tests');
        const collection = database.collection('multiPipeTest');
        const changeStream = collection.watch(pipeline);
        this.defer(() => changeStream.close());

        // Make a stream transforming to JSON and piping to the file
        const stream = changeStream.stream();
        const basicStream = stream.pipe(
          new Transform({
            transform: (data, encoding, callback) => callback(null, JSON.stringify(data)),
            objectMode: true
          })
        );
        const pipedStream = basicStream.pipe(cipher).pipe(decipher);

        let dataEmitted = '';
        pipedStream.on('data', function (data) {
          dataEmitted += data.toString();

          // Work around poor compatibility with crypto cipher
          stream.emit('end');
        });

        pipedStream.on('end', function () {
          const parsedData = JSON.parse(dataEmitted.toString());
          assert.equal(parsedData.operationType, 'insert');
          assert.equal(parsedData.fullDocument.a, 1407);

          basicStream.emit('close');
          done();
        });

        pipedStream.on('error', err => {
          done(err);
        });

        waitForStarted(changeStream, () => {
          this.defer(collection.insert({ a: 1407 }));
        });
      });
    }
  });

  it('should maintain change stream options on resume', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      const collectionName = 'resumeAfterKillCursor';
      const changeStreamOptions = {
        fullDocument: 'updateLookup',
        collation: { maxVariable: 'punct' },
        maxAwaitTimeMS: 20000,
        batchSize: 200
      };

      return client.connect().then(() => {
        this.defer(() => client.close());

        const db = client.db('integration_tests');
        const coll = db.collection(collectionName);
        const changeStream = coll.watch([], changeStreamOptions);
        this.defer(() => changeStream.close());

        expect(changeStream.cursor.resumeOptions).to.containSubset(changeStreamOptions);
      });
    }
  });

  // 9. $changeStream stage for ChangeStream against a server >=4.0 and <4.0.7 that has not received
  // any results yet MUST include a startAtOperationTime option when resuming a change stream.
  it('should include a startAtOperationTime field when resuming if no changes have been received', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=4.0 <4.0.7' } },
    test: function (done) {
      const configuration = this.configuration;

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
      const connectOptions = { monitorCommands: true };

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
          if (doc.ismaster || doc.hello) {
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

  // FIXME: NODE-1797
  describe('should error when used as iterator and emitter concurrently', function () {
    let client, coll, changeStream, repeatInsert, val;
    val = 0;

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect().catch(() => expect.fail('Failed to connect to client'));

      coll = client.db(this.configuration.db).collection('tester');
      changeStream = coll.watch();

      repeatInsert = setInterval(async function () {
        await coll.insertOne({ c: val }).catch('Failed to insert document');
        val++;
      }, 75);
    });

    afterEach(async function () {
      if (repeatInsert) {
        clearInterval(repeatInsert);
      }
      if (changeStream) {
        await changeStream.close();
      }

      await mock.cleanup();
      if (client) {
        await client.close();
      }
    });

    it(
      'should throw MongoDriverError when set as an emitter with "on" and used as an iterator with "hasNext"',
      {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
        test: async function () {
          await new Promise(resolve => changeStream.on('change', resolve));
          try {
            await changeStream.hasNext().catch(err => {
              expect.fail(err.message);
            });
          } catch (error) {
            return expect(error).to.be.instanceof(MongoDriverError);
          }
          return expect.fail('Should not reach here');
        }
      }
    );

    it(
      'should throw MongoDriverError when set as an iterator with "hasNext" and used as an emitter with "on"',
      {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
        test: async function () {
          await changeStream
            .hasNext()
            .catch(() => expect.fail('Failed to set changeStream to iterator'));
          try {
            await new Promise(resolve => changeStream.on('change', resolve));
          } catch (error) {
            return expect(error).to.be.instanceof(MongoDriverError);
          }
          return expect.fail('Should not reach here');
        }
      }
    );

    it(
      'should throw MongoDriverError when set as an emitter with "once" and used as an iterator with "next"',
      {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
        test: async function () {
          await new Promise(resolve => changeStream.once('change', resolve));
          try {
            await changeStream.next().catch(err => {
              expect.fail(err.message);
            });
          } catch (error) {
            return expect(error).to.be.instanceof(MongoDriverError);
          }
          return expect.fail('Should not reach here');
        }
      }
    );

    it(
      'should throw MongoDriverError when set as an iterator with "tryNext" and used as an emitter with "on"',
      {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
        test: async function () {
          await changeStream
            .tryNext()
            .catch(() => expect.fail('Failed to set changeStream to iterator'));
          try {
            await new Promise(resolve => changeStream.on('change', resolve));
          } catch (error) {
            return expect(error).to.be.instanceof(MongoDriverError);
          }
          return expect.fail('Should not reach here');
        }
      }
    );
  });

  describe('should properly handle a changeStream event being processed mid-close', function () {
    let client, coll, changeStream;

    function write() {
      return Promise.resolve()
        .then(() => coll.insertOne({ a: 1 }))
        .then(() => coll.insertOne({ b: 2 }));
    }

    function lastWrite() {
      return coll.insertOne({ c: 3 });
    }

    beforeEach(function () {
      client = this.configuration.newClient();
      return client.connect().then(_client => {
        client = _client;
        coll = client.db(this.configuration.db).collection('tester');
        changeStream = coll.watch();
      });
    });

    afterEach(function () {
      return Promise.resolve()
        .then(() => {
          if (changeStream && !changeStream.closed) {
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
      test: function () {
        const test = this;

        function read() {
          return Promise.resolve()
            .then(() => changeStream.next())
            .then(() => changeStream.next())
            .then(() => {
              test.defer(lastWrite());
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
      test: function (done) {
        const ops = [];
        changeStream.next(() => {
          changeStream.next(() => {
            ops.push(lastWrite());

            // explicitly close the change stream after the write has begun
            ops.push(changeStream.close());

            changeStream.next(err => {
              try {
                expect(err)
                  .property('message')
                  .to.match(/ChangeStream is closed/);
                Promise.all(ops).then(() => done(), done);
              } catch (e) {
                done(e);
              }
            });
          });
        });

        ops.push(write().catch(() => {}));
      }
    });

    it('when invoked using eventEmitter API', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: function (done) {
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
            changeStream.close(close);
          } else if (counter >= 3) {
            close(new MongoChangeStreamError('should not have received more than 2 events'));
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

  describe('resumeToken', function () {
    class MockServerManager {
      constructor(config, commandIterators) {
        this.config = config;
        this.cmdList = new Set(['ismaster', 'hello', 'endSessions', 'aggregate', 'getMore']);
        this.database = 'test_db';
        this.collection = 'test_coll';
        this.ns = `${this.database}.${this.collection}`;
        this._timestampCounter = 0;
        this.cursorId = new Long('9064341847921713401');
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
        return promise.then(function () {
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

      hello() {
        return this.ismaster();
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
        return new Timestamp(this._timestampCounter++, Date.now());
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
          _id: new ObjectId()
        };
      }
    }

    // 11. For a ChangeStream under these conditions:
    //   Running against a server >=4.0.7.
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the postBatchResumeToken from the current command response.
    describe('for emptied batch on server >= 4.0.7', function () {
      it('must return the postBatchResumeToken from the current command response', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: true, cursor: { firstBatch: [] } };
          })(),
          getMore: (function* () {
            yield { numDocuments: 1, postBatchResumeToken: true, cursor: { nextBatch: [{}] } };
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
    describe('for emptied batch on server <= 4.0.7', function () {
      it('must return the _id of the last document returned if one exists', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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
      it('must return resumeAfter from the initial aggregate if the option was specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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
      it('must be empty if resumeAfter options was not specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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
    describe('for non-empty batch iterated up to but not including the last element', function () {
      it('must return the _id of the previous document returned', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 2, postBatchResumeToken: true };
          })(),
          getMore: (function* () {})()
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
    describe('for non-empty non-iterated batch where only the initial aggregate command has been executed', function () {
      it('must return startAfter from the initial aggregate if the option was specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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
            expect(token).to.deep.equal(startAfter).and.to.not.deep.equal(resumeAfter);
          });
      });
      it('must return resumeAfter from the initial aggregate if the option was specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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
      it('must be empty if neither the startAfter nor resumeAfter options were specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
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

  describe('tryNext', function () {
    it('should return null on single iteration of empty cursor', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: withChangeStream((collection, changeStream, done) => {
        tryNext(changeStream, (err, doc) => {
          expect(err).to.not.exist;
          expect(doc).to.not.exist;
          done();
        });
      })
    });

    it('should iterate a change stream until first empty batch', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      test: withChangeStream((collection, changeStream, done) => {
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

              done();
            });
          });
        });
      })
    });
  });

  describe('startAfter', function () {
    let client;
    let coll;
    let startAfter;

    function recordEvent(events, e) {
      if (e.commandName !== 'aggregate') return;
      events.push({ $changeStream: e.command.pipeline[0].$changeStream });
    }

    beforeEach(function (done) {
      const configuration = this.configuration;
      client = configuration.newClient({ monitorCommands: true });
      client.connect(err => {
        expect(err).to.not.exist;
        coll = client.db('integration_tests').collection('setupAfterTest');
        const changeStream = coll.watch();
        waitForStarted(changeStream, () => {
          coll.insertOne({ x: 1 }, { writeConcern: { w: 'majority', j: true } }, err => {
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

    afterEach(function (done) {
      client.close(done);
    });

    it('should work with events', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function (done) {
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } }, err => {
          expect(err).to.not.exist;
          changeStream.once('change', change => {
            expect(change).to.containSubset({
              operationType: 'insert',
              fullDocument: { x: 2 }
            });

            done();
          });
        });
      }
    });

    it('should work with callbacks', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function (done) {
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } }, err => {
          expect(err).to.not.exist;
          exhaust(changeStream, (err, bag) => {
            expect(err).to.not.exist;
            const finalOperation = bag.pop();
            expect(finalOperation).to.containSubset({
              operationType: 'insert',
              fullDocument: { x: 2 }
            });

            done();
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
      test: function (done) {
        const events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        changeStream.once('change', change => {
          expect(change).to.containSubset({
            operationType: 'insert',
            fullDocument: { x: 2 }
          });

          expect(events).to.be.an('array').with.lengthOf(3);
          expect(events[0]).nested.property('$changeStream.startAfter').to.exist;
          expect(events[1]).to.equal('error');
          expect(events[2]).nested.property('$changeStream.startAfter').to.exist;
          done();
        });

        waitForStarted(changeStream, () => {
          triggerResumableError(changeStream, () => {
            events.push('error');
            coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } });
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
      test: function (done) {
        let events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        changeStream.on('change', change => {
          events.push({ change: { insert: { x: change.fullDocument.x } } });
          switch (change.fullDocument.x) {
            case 2:
              // only events after this point are relevant to this test
              events = [];
              triggerResumableError(changeStream, () => events.push('error'));
              break;
            case 3:
              expect(events).to.be.an('array').with.lengthOf(3);
              expect(events[0]).to.equal('error');
              expect(events[1]).nested.property('$changeStream.resumeAfter').to.exist;
              expect(events[2]).to.eql({ change: { insert: { x: 3 } } });
              done();
              break;
          }
        });

        waitForStarted(changeStream, () =>
          this.defer(
            coll
              .insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } })
              .then(() => coll.insertOne({ x: 3 }, { writeConcern: { w: 'majority', j: true } }))
          )
        );
      }
    });
  });
});

describe('Change Stream Resume Error Tests', function () {
  it('should continue emitting change events after a resumable error', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withChangeStream((collection, changeStream, done) => {
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

  it('should continue iterating changes after a resumable error', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withChangeStream((collection, changeStream, done) => {
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

  // TODO: resuming currently broken on piped change streams, unskip as part of NODE-2172
  it.skip('should continue piping changes after a resumable error', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withChangeStream((collection, changeStream, done) => {
      const d = new PassThrough({ objectMode: true });
      const bucket = [];
      d.on('data', data => {
        bucket.push(data.fullDocument.x);
        if (bucket.length === 2) {
          expect(bucket[0]).to.be(1);
          expect(bucket[0]).to.be(2);
          done();
        }
      });
      changeStream.stream().pipe(d);
      waitForStarted(changeStream, () => {
        collection.insertOne({ x: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;
          triggerResumableError(changeStream, 250, () => {
            collection.insertOne({ x: 2 }, (err, result) => {
              expect(err).to.not.exist;
              expect(result).to.exist;
            });
          });
        });
      });
    })
  });
});
context('NODE-2626 - handle null changes without error', function () {
  let mockServer;
  afterEach(() => mock.cleanup());
  beforeEach(() => mock.createServer().then(server => (mockServer = server)));
  it('changeStream should close if cursor id for initial aggregate is Long.ZERO', function (done) {
    mockServer.setMessageHandler(req => {
      const doc = req.document;
      if (doc.ismaster || doc.hello) {
        return req.reply(mock.DEFAULT_ISMASTER_36);
      }
      if (doc.aggregate) {
        return req.reply({
          ok: 1,
          cursor: {
            id: Long.ZERO,
            firstBatch: []
          }
        });
      }
      if (doc.getMore) {
        return req.reply({
          ok: 1,
          cursor: {
            id: new Long(1407, 1407),
            nextBatch: []
          }
        });
      }
      req.reply({ ok: 1 });
    });
    const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/`);
    client.connect(err => {
      expect(err).to.not.exist;
      const collection = client.db('cs').collection('test');
      const changeStream = collection.watch();
      changeStream.next((err, doc) => {
        expect(err).to.exist;
        expect(doc).to.not.exist;
        expect(err.message).to.equal('ChangeStream is closed');
        changeStream.close(() => client.close(done));
      });
    });
  });
});
