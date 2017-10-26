'use strict';
var assert = require('assert');
var MongoNetworkError = require('mongodb-core').MongoNetworkError;
var setupDatabase = require('./shared').setupDatabase;
var delay = require('./shared').delay;
var assign = require('../../lib/utils').assign;
var co = require('co');
var mock = require('../mock');

// Define the pipeline processing changes
var pipeline = [
  { $addFields: { addedField: 'This is a field added using $addFields' } },
  { $project: { documentKey: false } },
  { $addFields: { comment: 'The documentKey field has been projected out of this document.' } }
];

describe('Change Streams', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should create a Change Stream on a collection and emit `change` events', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);
        var collection = client.db('integration_tests').collection('docsDataEvent');
        var changeStream = collection.watch(pipeline);

        // Attach first event listener
        changeStream.once('change', function(change) {
          assert.equal(change.operationType, 'insert');
          assert.equal(change.fullDocument.d, 4);
          assert.equal(change.ns.db, 'integration_tests');
          assert.equal(change.ns.coll, 'docsDataEvent');
          assert.ok(!change.documentKey);
          assert.equal(
            change.comment,
            'The documentKey field has been projected out of this document.'
          );

          // Attach second event listener
          changeStream.once('change', function(change) {
            assert.equal(change.operationType, 'update');
            assert.equal(change.updateDescription.updatedFields.d, 6);

            // Close the change stream
            changeStream.close(function(err) {
              assert.ifError(err);
              done();
            });
          });

          // Trigger the second database event
          collection.update({ d: 4 }, { $inc: { d: 2 } }, function(err) {
            assert.ifError(err);
          });
        });

        // Trigger the first database event
        collection.insert({ d: 4 }, function(err) {
          assert.ifError(err);
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
        var MongoClient = configuration.require.MongoClient;
        var client = new MongoClient(configuration.url());

        client.connect(function(err, client) {
          assert.ifError(err);

          var collection = client.db('integration_tests').collection('docsCallback');
          var changeStream = collection.watch(pipeline);

          // Trigger the first database event
          collection.insert({ e: 5 }, function(err, result) {
            assert.ifError(err);
            assert.equal(result.insertedCount, 1);

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
                      changeStream.close(function(err) {
                        assert.ifError(err);
                        done();
                      });
                    });
                  });
                });
              });
            });
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var theCollection1 = theDatabase.collection('simultaneous1');
        var theCollection2 = theDatabase.collection('simultaneous2');

        var thisChangeStream1, thisChangeStream2, thisChangeStream3;

        theCollection1
          .insert({ a: 1 })
          .then(function() {
            return theCollection2.insert({ a: 1 });
          })
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

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
          done();
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
        var MongoClient = configuration.require.MongoClient;
        var client = new MongoClient(configuration.url());

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

            changeStream.close(function(err) {
              assert.ifError(err);
              done();
            });
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenCallback').watch(pipeline);

        // Trigger the first database event
        theDatabase.collection('cacheResumeTokenCallback').insert({ b: 2 }, function(err, result) {
          assert.ifError(err);
          assert.equal(result.insertedCount, 1);

          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, change) {
              assert.ifError(err);
              assert.deepEqual(thisChangeStream.resumeToken, change._id);

              // Close the change stream
              thisChangeStream.close(function(err) {
                assert.ifError(err);
                done();
              });
            });
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      return client.connect().then(function() {
        var theDatabase = client.db('integration_tests');
        var thisChangeStream = theDatabase.collection('cacheResumeTokenPromise').watch(pipeline);

        // Trigger the first database event
        return theDatabase
          .collection('cacheResumeTokenPromise')
          .insert({ b: 2 }, function(err, result) {
            assert.ifError(err);
            assert.equal(result.insertedCount, 1);

            // Fetch the change notification
            return thisChangeStream.hasNext();
          })
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            return thisChangeStream.next();
          })
          .then(function(change) {
            assert.deepEqual(thisChangeStream.resumeToken, change._id);

            // Close the change stream
            return thisChangeStream.close();
          });
      });
    }
  });

  it('Should cache the change stream resume token using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests');

        var thisChangeStream = theDatabase.collection('cacheResumeTokenListener').watch(pipeline);

        thisChangeStream.once('change', function(change) {
          assert.deepEqual(thisChangeStream.resumeToken, change._id);
          // Close the change stream
          thisChangeStream.close().then(function() {
            done();
          });
        });

        // Trigger the first database event
        theDatabase.collection('cacheResumeTokenListener').insert({ b: 2 }, function(err, result) {
          assert.ifError(err);
          assert.equal(result.insertedCount, 1);
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
        var MongoClient = configuration.require.MongoClient;
        var client = new MongoClient(configuration.url());

        client.connect(function(err, client) {
          assert.ifError(err);

          var theDatabase = client.db('integration_tests');
          var thisChangeStream = theDatabase
            .collection('resumetokenProjectedOutCallback')
            .watch([{ $project: { _id: false } }]);

          // Trigger the first database event
          theDatabase
            .collection('resumetokenProjectedOutCallback')
            .insert({ b: 2 }, function(err, result) {
              assert.ifError(err);
              assert.equal(result.insertedCount, 1);

              // Fetch the change notification
              thisChangeStream.hasNext(function(err, hasNext) {
                assert.ifError(err);
                assert.equal(true, hasNext);

                thisChangeStream.next(function(err) {
                  assert.ok(err);
                  assert.equal(
                    err.message,
                    'A change stream document has been recieved that lacks a resume token (_id).'
                  );

                  // Close the change stream
                  thisChangeStream.close().then(function() {
                    done();
                  });
                });
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());
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
            'A change stream document has been recieved that lacks a resume token (_id).'
          );

          thisChangeStream.close(function() {
            done();
          });
        });

        // Trigger the first database event
        theDatabase
          .collection('resumetokenProjectedOutListener')
          .insert({ b: 2 }, function(err, result) {
            assert.ifError(err);
            assert.equal(result.insertedCount, 1);
          });
      });
    }
  });

  it('Should invalidate change stream on collection rename using event listeners', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

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
          changeStream.once('change', function(change) {
            // Check the cursor invalidation has occured
            assert.equal(change.operationType, 'invalidate');

            // now expect the server to close the stream
            changeStream.once('close', done);
          });

          // Trigger the second database event
          database
            .collection('invalidateListeners')
            .rename('renamedDocs', { dropTarget: true }, function(err) {
              assert.ifError(err);
            });
        });

        // Trigger the first database event
        database.collection('invalidateListeners').insert({ a: 1 }, function(err) {
          assert.ifError(err);
        });
      });
    }
  });

  it('Should invalidate change stream on database drop using imperative callback form', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStream = database.collection('invalidateCallback').watch(pipeline);

        // Trigger the first database event
        database.collection('invalidateCallback').insert({ a: 1 }, function(err) {
          assert.ifError(err);

          changeStream.next(function(err, change) {
            assert.ifError(err);
            assert.equal(change.operationType, 'insert');

            database.dropDatabase(function(err) {
              assert.ifError(err);

              changeStream.next(function(err, change) {
                assert.ifError(err);

                // Check the cursor invalidation has occured
                assert.equal(change.operationType, 'invalidate');

                changeStream.hasNext(function(err, hasNext) {
                  assert.equal(hasNext, false);
                  assert.equal(changeStream.isClosed(), true);
                  done();
                });
              });
            });
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
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);
        var database = client.db('integration_tests_2');
        var changeStream = database.collection('invalidateCollectionDropPromises').watch(pipeline);

        // Trigger the first database event
        return database
          .collection('invalidateCollectionDropPromises')
          .insert({ a: 1 })
          .then(function() {
            return delay(200);
          })
          .then(function() {
            return changeStream.next();
          })
          .then(function(change) {
            assert.equal(change.operationType, 'insert');
            return database.dropCollection('invalidateCollectionDropPromises');
          })
          .then(function() {
            return changeStream.next();
          })
          .then(function(change) {
            // Check the cursor invalidation has occured
            assert.equal(change.operationType, 'invalidate');
            return changeStream.hasNext();
          })
          .then(function(hasNext) {
            assert.equal(hasNext, false);
            assert.equal(changeStream.isClosed(), true);
            done();
          })
          .catch(function(err) {
            assert.ifError(err);
          });
      });
    }
  });

  it.skip('Should return MongoNetworkError after first retry attempt fails using promises', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId;

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
              assign(
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

      var client = new MongoClient(configuration.url());
      client.connect(function(err /* , client */) {
        assert.ifError(err);

        // var database = client.db('integration_tests5');
        // var collection = database.collection('MongoNetworkErrorTestPromises');
        // var changeStream = collection.watch(pipeline);

        mock.cleanup([primaryServer], () => done());

        // changeStream.next()
        //   .then(function (change) {
        //     // We should never execute this line because calling thisChangeStream.next() should throw an error
        //     throw new Error('ChangeStream.next() returned a change document but it should have returned a MongoNetworkError')
        //   })
        //   .catch(function(err) {
        //     console.dir(err);
        //     assert.ok(err instanceof MongoNetworkError);
        //     assert.ok(err.message);
        //     assert.ok(err.message.indexOf('timed out') > -1);

        //     changeStream.close(function(err) {
        //       assert.ifError(err);
        //       changeStream.close();

        //       running = false;
        //       primaryServer.destroy();

        //       done();
        //     });
        //   });
      });
    }
  });

  it.skip('Should return MongoNetworkError after first retry attempt fails using callbacks', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId;

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
              assign(
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

      MongoClient.connect(
        'mongodb://localhost:32000/test?replicaSet=rs',
        {
          socketTimeoutMS: 500,
          validateOptions: true
        },
        function(err, client) {
          assert.ifError(err);

          var theDatabase = client.db('integration_tests5');
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

              mock.cleanup([primaryServer], () => done());
            });
          });
        }
      );
    }
  });

  it.skip('Should resume Change Stream when a resumable error is encountered', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        mongodb: '>=3.5.10'
      }
    },
    test: function() {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Timestamp = configuration.require.Timestamp,
        Long = configuration.require.Long;

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
              assign(
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

      return MongoClient.connect('mongodb://localhost:32000/test?replicaSet=rs', {
        socketTimeoutMS: 500,
        validateOptions: true
      }).then(client => {
        var database = client.db('integration_tests5');
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

            return Promise.all([changeStream.close(), primaryServer.destroy]);
          });
      });
    }
  });

  it('Should resume from point in time using user-provided resumeAfter', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      return client.connect().then(client => {
        var database = client.db('integration_tests');
        var collection = database.collection('resumeAfterTest2');

        var firstChangeStream, secondChangeStream;

        var resumeToken;
        var docs = [{ a: 0 }, { a: 1 }, { a: 2 }];

        // Trigger the first database event
        return collection
          .insert(docs[0])
          .then(function(result) {
            assert.equal(result.insertedCount, 1);
            firstChangeStream = collection.watch(pipeline);
            return collection.insert(docs[1]);
          })
          .then(function(result) {
            assert.equal(result.insertedCount, 1);
            return collection.insert(docs[2]);
          })
          .then(function(result) {
            assert.equal(result.insertedCount, 1);
            return delay(200);
          })
          .then(function() {
            return firstChangeStream.hasNext();
          })
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
            secondChangeStream = collection.watch(pipeline, { resumeAfter: resumeToken });
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
          });
      });
    }
  });

  it('Should support full document lookup', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      return client.connect().then(client => {
        var database = client.db('integration_tests09');
        var collection = database.collection('fullDocumentLookup');
        var changeStream = collection.watch(pipeline, { fullDocument: 'lookup' });
        changeStream.hasNext();

        return delay(500)
          .then(function() {
            console.log('inserting');
            return collection.insert({ f: 128 });
          })
          .then(function(result) {
            assert.equal(result.insertedCount, 1);
            console.log('inserted');
            return delay(200);
          })
          .then(function() {
            console.log('checking hasNext');
            return changeStream.hasNext();
          })
          .then(function(hasNext) {
            assert.equal(true, hasNext);
            console.log('hasNext: ', hasNext);
            return changeStream.next();
          })
          .then(function(change) {
            console.log('got next doc');
            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument.f, 128);
            assert.equal(change.ns.db, database.databaseName);
            assert.equal(change.ns.coll, collection.collectionName);
            assert.ok(!change.documentKey);
            assert.equal(
              change.comment,
              'The documentKey field has been projected out of this document.'
            );

            // Trigger the second database event
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

            return changeStream.close();
          });
      });
    }
  });

  it('Should support full document lookup with deleted documents', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      return client.connect().then(client => {
        var database = client.db('integration_tests13');
        var collection = database.collection('fullLookupTest');
        var changeStream = collection.watch(pipeline, { fullDocument: 'lookup' });

        // Trigger the first database event
        return collection
          .insert({ i: 128 })
          .then(function(result) {
            assert.equal(result.insertedCount, 1);

            return collection.deleteOne({ i: 128 });
          })
          .then(function(result) {
            assert.equal(result.result.n, 1);

            return delay(200);
          })
          .then(function() {
            return changeStream.hasNext();
          })
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
          });
      });
    }
  });

  it('Should create Change Streams with correct read preferences', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var ReadPreference = configuration.require.ReadPreference;
      var client = new MongoClient(configuration.url());

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

        return Promise.all([changeStream0.close(), changeStream1.close(), changeStream2.close()]);
      });
    }
  });

  it('Should support piping of Change Streams', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var fs = require('fs');
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var theDatabase = client.db('integration_tests14');
        var theCollection = theDatabase.collection('pipeTest');
        var thisChangeStream = theCollection.watch(pipeline);

        var filename = '/tmp/_nodemongodbnative_stream_out.txt';
        var outStream = fs.createWriteStream(filename);

        // Make a stream transforming to JSON and piping to the file
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
            done();
          });
        });

        theCollection.insert({ a: 1 }, function(err) {
          assert.ifError(err);
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
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Timestamp = configuration.require.Timestamp,
        Long = configuration.require.Long;

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

        var counter = 0;
        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          // Create a server that responds to the initial aggregation to connect to the server, but not to subsequent getMore requests
          if (doc.ismaster) {
            request.reply(
              assign(
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
            console.log('GETMORE EVENT');

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
            console.log('AGGREGATE EVENT');
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
      });

      MongoClient.connect(
        'mongodb://localhost:32000/test?replicaSet=rs',
        {
          socketTimeoutMS: 500,
          validateOptions: true
        },
        function(err, client) {
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
            console.log(fileContents);

            // var parsedFileContents = JSON.parse(fileContents);
            // assert.equal(parsedFileContents.fullDocument.a, 1);
            //
            watcher.close();
            done();

            //
            // thisChangeStream.close(function(err) {
            //   assert.ifError(err);
            //   done();
            // });
          });
        }
      );
    }
  });

  it('Should support piping of Change Streams through multiple pipes', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var crypto = require('crypto');
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url(), { poolSize: 1, autoReconnect: false });

      client.connect(function(err, client) {
        assert.ifError(err);

        var cipher = crypto.createCipher('aes192', 'a password');
        var decipher = crypto.createDecipher('aes192', 'a password');

        var theDatabase = client.db('integration_tests19');
        var theCollection = theDatabase.collection('multiPipeTest');
        var thisChangeStream = theCollection.watch(pipeline);

        // Make a stream transforming to JSON and piping to the file
        var basicStream = thisChangeStream.stream({ transform: JSON.stringify });
        var pipedStream = basicStream.pipe(cipher).pipe(decipher);

        var dataEmitted = '';
        pipedStream.on('change', function(data) {
          dataEmitted += data.toString();

          // Work around poor compatibility with crypto cipher
          thisChangeStream.cursor.emit('end');
        });

        pipedStream.on('end', function() {
          var parsedData = JSON.parse(dataEmitted.toString());
          assert.equal(parsedData.operationType, 'insert');
          assert.equal(parsedData.fullDocument.a, 1407);

          basicStream.emit('close');

          thisChangeStream.close(function(err) {
            assert.ifError(err);
            done();
          });
        });

        pipedStream.on('error', function(err) {
          assert.ifError(err);
        });

        theCollection.insert({ a: 1407 }, function(err) {
          assert.ifError(err);
        });
      });
    }
  });

  it.skip('Should error when attempting to create a Change Stream against a stand-alone server', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.5.10' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = new MongoClient(configuration.url());

      client.connect(function(err, client) {
        assert.ifError(err);

        var database = client.db('integration_tests');
        var changeStreamTest = database.collection('standAloneTest').watch();
        changeStreamTest.hasNext(function(err, result) {
          assert.equal(null, result);
          assert.ok(err);
          assert.equal(
            err.message,
            'SOME SERVER ERROR MESSAGE SAYING THAT CHANGE STREAMS CAN ONLY BE CREATED AGAINST REPLSETS'
          );

          done();
        });
      });
    }
  });
});
