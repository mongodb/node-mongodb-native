'use strict';
const assert = require('assert');
const { Transform, PassThrough } = require('stream');
const { delay, setupDatabase, withClient, withCursor } = require('../shared');
const mock = require('../../tools/mongodb-mock/index');
const { EventCollector, getSymbolFrom } = require('../../tools/utils');
const { expect } = require('chai');

const sinon = require('sinon');
const { Long, ReadPreference, MongoNetworkError } = require('../../../src');

const crypto = require('crypto');
const { isHello } = require('../../../src/utils');
const { skipBrokenAuthTestBeforeEachHook } = require('../../tools/runner/hooks/configuration');

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
  changeStream.cursor.once('init', () => {
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
  before(async function () {
    return await setupDatabase(this.configuration, ['integration_tests']);
  });

  beforeEach(async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();

    await client.connect();
    const db = client.db('integration_tests');
    try {
      await db.createCollection('test');
    } catch {
      // ns already exists, don't care
    } finally {
      await client.close();
    }
  });
  afterEach(async () => await mock.cleanup());

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

  // TODO: NODE-3819: Unskip flaky MacOS tests.
  const maybeIt = process.platform === 'darwin' ? it.skip : it;
  maybeIt('should cache the change stream resume token using promises', {
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

  it('should error if resume token projected out of change stream document using iterator', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const database = client.db('integration_tests');
        const collection = database.collection('resumetokenProjectedOutCallback');
        const changeStream = collection.watch([{ $project: { _id: false } }]);

        changeStream.hasNext(() => {}); // trigger initialize

        changeStream.cursor.on('init', () => {
          collection.insertOne({ b: 2 }, (err, res) => {
            expect(err).to.be.undefined;
            expect(res).to.exist;

            changeStream.next(err => {
              expect(err).to.exist;
              changeStream.close(() => {
                client.close(() => {
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

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

  describe('should error when used as iterator and emitter concurrently', function () {
    let client, coll, changeStream, kMode, initPromise;

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();

      coll = client.db(this.configuration.db).collection('tester');
      changeStream = coll.watch();
      kMode = getSymbolFrom(changeStream, 'mode');
      initPromise = new Promise(resolve => waitForStarted(changeStream, resolve));
    });

    afterEach(async function () {
      let err;
      if (changeStream) {
        try {
          if (changeStream[kMode] === 'emitter') {
            // shutting down the client will end the session, if this happens before
            // the stream initialization aggregate operation is processed, it will throw
            // a session ended error, which can't be caught if we end the stream, so
            // we need to wait for the stream to initialize before closing all the things
            await initPromise;
          }
          await changeStream.close();
        } catch (error) {
          // don't throw before closing the client
          err = error;
        }
      }

      if (client) {
        await client.close();
      }

      if (err) {
        throw err;
      }
    });

    it(`should throw when mixing event listeners with iterator methods`, {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      async test() {
        expect(changeStream).to.have.property(kMode, false);
        // ChangeStream detects emitter usage via 'newListener' event
        // so this covers all emitter methods
        changeStream.on('change', () => {});
        expect(changeStream).to.have.property(kMode, 'emitter');

        const errRegex = /ChangeStream cannot be used as an iterator/;

        // These all throw synchronously so it should be safe to not await the results
        expect(() => {
          changeStream.next();
        }).to.throw(errRegex);
        expect(() => {
          changeStream.hasNext();
        }).to.throw(errRegex);
        expect(() => {
          changeStream.tryNext();
        }).to.throw(errRegex);
      }
    });

    it(`should throw when mixing iterator methods with event listeners`, {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
      async test() {
        expect(changeStream).to.have.property(kMode, false);
        const res = await changeStream.tryNext();
        expect(res).to.not.exist;
        expect(changeStream).to.have.property(kMode, 'iterator');

        // This does throw synchronously
        // the newListener event is called sync
        // which calls streamEvents, which calls setIsEmitter, which will throw
        expect(() => {
          changeStream.on('change', () => {});
        }).to.throw(/ChangeStream cannot be used as an EventEmitter/);
      }
    });
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

    beforeEach(
      skipBrokenAuthTestBeforeEachHook({
        skippedTests: ['when invoked using eventEmitter API']
      })
    );

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
      metadata: {
        requires: { topology: 'replicaset', mongodb: '>=3.6', auth: 'disabled' }
      },
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
  }).skipReason = 'TODO(NODE-3884): Fix when implementing prose case #3';
});
context('NODE-2626 - handle null changes without error', function () {
  let mockServer;
  afterEach(() => mock.cleanup());
  beforeEach(() => mock.createServer().then(server => (mockServer = server)));
  it('changeStream should close if cursor id for initial aggregate is Long.ZERO', function (done) {
    mockServer.setMessageHandler(req => {
      const doc = req.document;
      if (isHello(doc)) {
        return req.reply(mock.HELLO);
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
