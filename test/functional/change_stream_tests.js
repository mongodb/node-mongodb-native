var assert = require('assert');
var MongoNetworkError = require('mongodb-core').MongoError.MongoNetworkError;
var ReadPreference = require('../../lib/read_preference');

// Define the pipeline processing changes
var pipeline = [
  { $addFields: { "addedField": "This is a field added using $addFields" } },
  { $project: { documentKey: false } },
  { $addFields: { "comment": "The documentKey field has been projected out of this document." } }
];

exports['Should create a Change Stream on a collection and emit data events'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {

    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theCollection = client.db('integration_tests').collection('docsDataEvent');

      var thisChangeStream = theCollection.watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('data', function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.d, 4);
        assert.equal(change.ns.db, 'integration_tests');
        assert.equal(change.ns.coll, 'docsDataEvent');
        assert.ok(!(change.documentKey));
        assert.equal(change.comment, 'The documentKey field has been projected out of this document.');

        // Attach second event listener
        thisChangeStream.once('data', function(change) {
          assert.equal(change.operationType, 'update');
          assert.equal(change.updateDescription.updatedFields.d, 6);

          // Close the change stream
          thisChangeStream.close(function(err) {
            assert.ifError(err);
            test.done();
          });
        });

        // Trigger the second database event
        theCollection.update({d:4}, {$inc: {d:2}}, function (err) {
          assert.ifError(err);
        });
      });

      // Trigger the first database event
      theCollection.insert({d:4}, function (err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should create a Change Stream on a collection and get change events through imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theCollection = client.db('integration_tests').collection('docsCallback');

      var thisChangeStream = theCollection.watch(pipeline);

      // Trigger the first database event
      theCollection.insert({e:5}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        // Fetch the change notification
        thisChangeStream.hasNext(function(err, hasNext) {
          assert.ifError(err);
          assert.equal(true, hasNext);
          thisChangeStream.next(function(err, change) {
            assert.ifError(err);
            assert.equal(change.operationType, 'insert');
            assert.equal(change.newDocument.e, 5);
            assert.equal(change.ns.db, 'integration_tests');
            assert.equal(change.ns.coll, 'docsCallback');
            assert.ok(!(change.documentKey));
            assert.equal(change.comment, 'The documentKey field has been projected out of this document.');

            // Trigger the second database event
            theCollection.update({e:5}, {$inc: {e:2}}, function (err) {
              assert.ifError(err);
              thisChangeStream.hasNext(function(err, hasNext) {
                assert.ifError(err);
                assert.equal(true, hasNext);
                thisChangeStream.next(function(err, change) {
                  assert.ifError(err);
                  assert.equal(change.operationType, 'update');
                  // Close the change stream
                  thisChangeStream.close(function(err) {
                    assert.ifError(err);
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
};

exports['Should support creating multiple simultaneous Change Streams'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection1 = theDatabase.collection('simultaneous1');
      var theCollection2 = theDatabase.collection('simultaneous2');

      var thisChangeStream1, thisChangeStream2, thisChangeStream3;

      theCollection1.insert({a: 1}).then(function() {
        return theCollection2.insert({a: 1});
      }).then(function () {
        thisChangeStream1 = theCollection1.watch([{ $addFields: { "changeStreamNumber": 1 } }]);
        thisChangeStream2 = theCollection2.watch([{ $addFields: { "changeStreamNumber": 2 } }]);
        thisChangeStream3 = theCollection2.watch([{ $addFields: { "changeStreamNumber": 3 } }]);

        return Promise.all([thisChangeStream1.hasNext(), thisChangeStream2.hasNext(), thisChangeStream3.hasNext()]);
      }).then(function(hasNexts) {
        // Check all the Change Streams have a next item
        assert.ok(hasNexts[0]);
        assert.ok(hasNexts[1]);
        assert.ok(hasNexts[2]);

        return Promise.all([thisChangeStream1.next(), thisChangeStream2.next(), thisChangeStream3.next()]);
      }).then(function(changes) {
        // Check the values of the change documents are correct
        assert.equal(changes[0].operationType, 'insert');
        assert.equal(changes[1].operationType, 'insert');
        assert.equal(changes[2].operationType, 'insert');

        assert.equal(changes[0].newDocument.a, 1);
        assert.equal(changes[1].newDocument.a, 1);
        assert.equal(changes[2].newDocument.a, 1);

        assert.equal(changes[0].ns.db, 'integration_tests');
        assert.equal(changes[1].ns.db, 'integration_tests');
        assert.equal(changes[2].ns.db, 'integration_tests');

        assert.equal(changes[0].ns.coll, 'simultaneous1');
        assert.equal(changes[1].ns.coll, 'simultaneous2');
        assert.equal(changes[2].ns.coll, 'simultaneous2');

        assert.equal(changes[0].changeStreamNumber, 1);
        assert.equal(changes[1].changeStreamNumber, 2);
        assert.equal(changes[2].changeStreamNumber, 3);

        return Promise.all([thisChangeStream1.close(), thisChangeStream2.close(), thisChangeStream3.close()]);
      }).then(function() {
        test.done();
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should properly close Change Stream cursor'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {

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
        test.done();
      });
    });
  }
};

exports['UPDATE WHEN SERVER-29137 DONE Should error when attempting to create a Change Stream with a forbidden aggrgation pipeline stage'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var changeStream = theDatabase.collection('forbiddenStageTest').watch([{$alksdjfhlaskdfjh: 2}]);
      changeStream.next(function(err) {
        assert.ok(err);
        assert.ok(err.message);
        // assert.ok(err.message.indexOf('SOME ERROR MESSAGE HERE ONCE SERVER-29137 IS DONE') > -1);

        changeStream.close(function(err) {
          assert.ifError(err);
          test.done();
        });
      });
    });
  }
};

exports['Should cache the change stream resume token using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('cacheResumeTokenCallback').watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('cacheResumeTokenCallback').insert({b:2}, function (err, result) {
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
              test.done();
            });
          });
        });
      });
    });
  }
};

exports['Should cache the change stream resume token using promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('cacheResumeTokenPromise').watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('cacheResumeTokenPromise').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        // Fetch the change notification
        thisChangeStream.hasNext().then(function(hasNext) {
          assert.equal(true, hasNext);
          thisChangeStream.next().then(function(change) {
            assert.deepEqual(thisChangeStream.resumeToken, change._id);

            // Close the change stream
            thisChangeStream.close().then(function() {
              test.done();
            });
          });
        }).catch(function(err) {
          assert.ifError(err);
        });
      });
    });
  }
};

exports['Should cache the change stream resume token using event listeners'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('cacheResumeTokenListener').watch(pipeline);

      thisChangeStream.once('data', function(change) {
        assert.deepEqual(thisChangeStream.resumeToken, change._id);
        // Close the change stream
        thisChangeStream.close().then(function() {
          test.done();
        });
      });

      // Trigger the first database event
      theDatabase.collection('cacheResumeTokenListener').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
      });
    });
  }
};

exports['Should error if resume token projected out of change stream document using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('resumetokenProjectedOutCallback').watch([{$project: {_id: false}}]);

      // Trigger the first database event
      theDatabase.collection('resumetokenProjectedOutCallback').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
        // Fetch the change notification
        thisChangeStream.hasNext(function(err, hasNext) {
          assert.ifError(err);
          assert.equal(true, hasNext);
          thisChangeStream.next(function(err) {
            assert.ok(err);
            assert.equal(err.message, 'A change stream document has been recieved that lacks a resume token (_id).');
            // Close the change stream
            thisChangeStream.close().then(function() {
              test.done();
            });
          });
        });
      });
    });
  }
};

exports['Should error if resume token projected out of change stream document using event listeners'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('resumetokenProjectedOutListener').watch([{$project: {_id: false}}]);

      // Fetch the change notification
      thisChangeStream.on('data', function() {
        assert.ok(false);
      });

      thisChangeStream.on('error', function(err) {
        assert.equal(err.message, 'A change stream document has been recieved that lacks a resume token (_id).');
        thisChangeStream.close(function() {
          test.done();
        });
      });

      // Trigger the first database event
      theDatabase.collection('resumetokenProjectedOutListener').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
      });

    });
  }
};

exports['UPDATE WHEN SERVER-29140 DONE Should invalidate change stream on collection rename using event listeners'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('invalidateListeners').watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('data', function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.a, 1);
        assert.equal(change.ns.db, 'integration_tests');
        assert.equal(change.ns.coll, 'invalidateListeners');
        assert.ok(!(change.documentKey));
        assert.equal(change.comment, 'The documentKey field has been projected out of this document.');

        // Attach second event listener
        thisChangeStream.once('data', function(change) {
          // Check the cursor invalidation has occured
          assert.equal(change.operationType, 'invalidate');
          // assert.equal(thisChangeStream.isClosed(), true); // UN-COMMENT WHEN SERVER-29140 DONE

          test.done();
        });

        // Trigger the second database event
        theDatabase.collection('invalidateListeners').rename('renamedDocs', {dropTarget: true}, function (err) {
          assert.ifError(err);
        });
      });

      // Trigger the first database event
      theDatabase.collection('invalidateListeners').insert({a:1}, function (err) {
        assert.ifError(err);
      });
    });
  }
};

exports['UPDATE WHEN SERVER-29140 DONE Should invalidate change stream on database drop using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('invalidateCallback').watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('invalidateCallback').insert({a:1}, function (err) {
        assert.ifError(err);

        thisChangeStream.next(function(err, change) {
          assert.ifError(err);
          assert.equal(change.operationType, 'insert');

          theDatabase.dropDatabase(function(err) {
            assert.ifError(err);

            thisChangeStream.next(function(err, change) {
              assert.ifError(err);

              // Check the cursor invalidation has occured
              assert.equal(change.operationType, 'invalidate');
              // assert.equal(thisChangeStream.isClosed(), true); // UN-COMMENT WHEN SERVER-29140 DONE

              test.done();

            });
          });
        });
      });
    });
  }
};

exports['UPDATE WHEN SERVER-29140 DONE Should invalidate change stream on collection drop using promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests_2');

      var thisChangeStream = theDatabase.collection('invalidateCollectionDropPromises').watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('invalidateCollectionDropPromises').insert({a:1}).then(function () {
        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.next());
          }, 200);
        });
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        return theDatabase.dropCollection('invalidateCollectionDropPromises');
      }).then(function() {
        return thisChangeStream.next();
      }).then(function(change) {
        // Check the cursor invalidation has occured
        assert.equal(change.operationType, 'invalidate');
        // assert.equal(thisChangeStream.isClosed(), true); // UN-COMMENT WHEN SERVER-29140 DONE

        test.done();
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should re-establish connection when a MongoNetworkError is encountered'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var socketTimeoutMS = 500;
    var client = new MongoClient(configuration.url(), {
      socketTimeoutMS: socketTimeoutMS,
      readPreference: ReadPreference.SECONDARY,
      validateOptions: true
    });

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection = theDatabase.collection('MongoNetworkErrorTest');
      var thisChangeStream = theCollection.watch(pipeline);
      var mongodPID;

      theDatabase.command({'serverStatus': 1}).then(function(serverStatus) {
        assert.ok(serverStatus);
        assert.equal(typeof serverStatus.pid, 'number');
        mongodPID = serverStatus.pid;

        return theCollection.insertOne({a: 1});
      }).then(function() {
        return theCollection.insertOne({b: 2});
      }).then(function() {
        return thisChangeStream.next();
      }).then(function(change) {
        // Check the cursor is the initial cursor
        thisChangeStream.cursor.cursorNumber = 1;

        // Check the document is the document we are expecting
        assert.ok(change);
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.a, 1);
        assert.deepEqual(thisChangeStream.resumeToken, change._id);

        // Suspend the mongod instance for a while
        process.kill(mongodPID, 'SIGSTOP');
        setTimeout(function() {
          process.kill(mongodPID, 'SIGCONT');
        }, socketTimeoutMS + 1);

        // Get the next change stream document.
        // Because the server is suspended, this should timeout and result in a MongoNetworkError
        // The Change Stream should automatically re-connect.
        return thisChangeStream.next();
      }).then(function(change) {
        // Check a new cursor has been established
        assert.notEqual(thisChangeStream.cursor.cursorNumber, 1);

        assert.ok(change);
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.b, 2);
        assert.deepEqual(thisChangeStream.resumeToken, change._id);

        // Close the change stream
        thisChangeStream.close(function(err) {
          assert.ifError(err);
          test.done();
        });
      }).catch(function(err) {
        assert.ifError(err);
      });

    });
  }
};

exports['Should return MongoNetworkError after first retry attempt fails using promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url(), {
      socketTimeoutMS: 500,
      connectTimeoutMS: 100
    });

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection = theDatabase.collection('MongoNetworkErrorTestPromises');
      var thisChangeStream = theCollection.watch(pipeline);
      var mongodPID;

      theDatabase.command({'serverStatus': 1}).then(function(serverStatus) {
        assert.ok(serverStatus);
        assert.equal(typeof serverStatus.pid, 'number');
        mongodPID = serverStatus.pid;

        return theCollection.insertOne({a: 1});
      }).then(function() {
        return theCollection.insertOne({b: 2});
      }).then(function() {
        return thisChangeStream.next();
      }).then(function(change) {
        // Check the document is the document we are expecting
        assert.ok(change);
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.a, 1);
        assert.deepEqual(thisChangeStream.resumeToken, change._id);

        // Suspend the mongod instance
        process.kill(mongodPID, 'SIGSTOP');

        // Get the next change stream document.
        // Because the server is suspended this will fail. After attempting to reconnect once, a MongoNetworkError will be returned.
        return thisChangeStream.next();
      }).then(function () {
        // We should never execute this line
        assert.ok(false);
      }).catch(function(err) {
        assert.ok(err instanceof MongoNetworkError);
        assert.ok(err.message);
        assert.ok(err.indexOf('timed out') > -1);

        // Continue mongod execution
        process.kill(mongodPID, 'SIGCONT');

        thisChangeStream.close(function(err) {
          assert.ifError(err);
          test.done();
        });
      });
    });
  }
};

exports['Should return MongoNetworkError after first retry attempt fails using callbacks'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url(), {
      socketTimeoutMS: 500,
      connectTimeoutMS: 100
    });

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection = theDatabase.collection('MongoNetworkErrorTestCallback');
      var thisChangeStream = theCollection.watch(pipeline);
      var mongodPID;

      theDatabase.command({'serverStatus': 1}, function(err, serverStatus) {
        assert.ifError(err);
        assert.ok(serverStatus);
        assert.equal(typeof serverStatus.pid, 'number');
        mongodPID = serverStatus.pid;

        theCollection.insertOne({a: 1}, function(err) {
          assert.ifError(err);
          theCollection.insertOne({b: 2}, function(err) {
            assert.ifError(err);
            thisChangeStream.next(function(err, change) {
              assert.ifError(err);

              // Check the document is the document we are expecting
              assert.ok(change);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.newDocument.a, 1);
              assert.deepEqual(thisChangeStream.resumeToken, change._id);

              // Suspend the mongod instance
              process.kill(mongodPID, 'SIGSTOP');

              // Get the next change stream document.
              // Because the server is suspended this will fail. After attempting to reconnect once, a MongoNetworkError will be returned.
              thisChangeStream.next(function(err, change) {
                assert.ok(err);
                assert.equal(change, null);
                assert.ok(err instanceof MongoNetworkError);

                // Continue mongod execution
                process.kill(mongodPID, 'SIGCONT');

                thisChangeStream.close(function(err) {
                  assert.ifError(err);
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  }
};

exports['Should resume from point in time using user-provided resumeAfter'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisFirstChangeStream = theDatabase.watch(pipeline);
      var thisSecondChangeStream;

      var resumeToken;

      // Trigger the first database event
      theDatabase.collection('docs').insert({f:6}).then(function (result) {
        assert.equal(result.insertedCount, 1);
        return theDatabase.collection('docs').insert({g:7});
      }).then(function (result) {
        assert.equal(result.insertedCount, 1);
        return theDatabase.collection('docs').insert({h:8});
      }).then(function (result) {
        assert.equal(result.insertedCount, 1);
        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisFirstChangeStream.hasNext());
          }, 200);
        });
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisFirstChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.f, 6);

        // Save the resumeToken
        resumeToken = change._id;

        return thisFirstChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.g, 7);

        return thisFirstChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.h, 8);

        return thisFirstChangeStream.close();
      }).then(function() {
        thisSecondChangeStream = theDatabase.watch(pipeline, {resumeAfter: resumeToken});

        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisSecondChangeStream.hasNext());
          }, 200);
        });

      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisSecondChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.g, 7);

        return thisSecondChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.h, 8);

        return thisSecondChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

  exports['Should support full document lookup'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('fullDocumentLookup').watch(pipeline, {fullDocument: 'lookup'});

      // Trigger the first database event
      theDatabase.collection('fullDocumentLookup').insert({f:128}).then(function (result) {
        assert.equal(result.insertedCount, 1);

        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.hasNext());
          }, 200);
        });
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.f, 128);
        assert.equal(change.ns.db, 'integration_tests');
        assert.equal(change.ns.coll, 'fullDocumentLookup');
        assert.ok(!(change.documentKey));
        assert.equal(change.comment, 'The documentKey field has been projected out of this document.');

        // Trigger the second database event
        return theDatabase.collection('fullDocumentLookup').update({f: 128}, {$set: {c:2}});
      }).then(function () {
        return thisChangeStream.hasNext();
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'update');

        // Check the full lookedUpDocument is present
        assert.ok(change.lookedUpDocument);
        assert.equal(change.lookedUpDocument.f, 128);
        assert.equal(change.lookedUpDocument.c, 2);

        return thisChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should support full document lookup with deleted documents'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline, {fullDocument: 'lookup'});

      // Trigger the first database event
      theDatabase.collection('docs').insert({i:128}).then(function (result) {
        assert.equal(result.insertedCount, 1);

        return theDatabase.collection('docs').deleteOne({i:128});
      }).then(function(result) {
        assert.equal(result.result.n, 1);

        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.hasNext());
          }, 200);
        });
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.i, 128);
        assert.equal(change.ns.db, 'integration_tests');
        assert.equal(change.ns.coll, 'docs');
        assert.ok(!(change.documentKey));
        assert.equal(change.comment, 'The documentKey field has been projected out of this document.');

        // Trigger the second database event
        return theDatabase.collection('docs').update({i: 128}, {$set: {c:2}});
      }).then(function () {
        return thisChangeStream.hasNext();
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisChangeStream.next();
      }).then(function(change) {
        assert.equal(change.operationType, 'delete');

        // Check the full lookedUpDocument is present
        assert.equal(change.lookedUpDocument, null);

        return thisChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should create Change Streams with correct read preferences'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      // Should get preference from database
      var theDatabase = client.db('integration_tests', {readPreference: ReadPreference.PRIMARY_PREFERRED});
      var thisChangeStream1 = theDatabase.watch(pipeline);
      assert.deepEqual(thisChangeStream1.cursor.readPreference.preference, ReadPreference.PRIMARY_PREFERRED);

      // Should get preference from collection
      var theCollection = theDatabase.collection('docs', {readPreference: ReadPreference.SECONDARY_PREFERRED});
      var thisChangeStream2 = theCollection.watch(pipeline);
      assert.deepEqual(thisChangeStream2.cursor.readPreference.preference, ReadPreference.SECONDARY_PREFERRED);

      // Should get preference from Change Stream options
      var thisChangeStream3 = theCollection.watch(pipeline, {readPreference: ReadPreference.NEAREST});
      assert.deepEqual(thisChangeStream3.cursor.readPreference.preference, ReadPreference.NEAREST);

      Promise.all([thisChangeStream1.close(), thisChangeStream2.close(), thisChangeStream3.close()]).then(function(){
        setTimeout(test.done, 1100);
      });

    });
  }
};

exports['Should support piping of Change Streams'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var fs = require('fs');
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection = theDatabase.collection('pipeTest');
      var thisChangeStream = theCollection.watch(pipeline);

      var filename = '/tmp/_nodemongodbnative_stream_out.txt';
      var outStream = fs.createWriteStream(filename);

      // Make a stream transforming to JSON and piping to the file
      thisChangeStream.stream({transform: JSON.stringify}).pipe(outStream);

      // Listen for changes to the file
      var watcher = fs.watch(filename, function(eventType) {
        assert.equal(eventType, 'change');

        var fileContents = fs.readFileSync(filename, 'utf8');
        var parsedFileContents = JSON.parse(fileContents);
        assert.equal(parsedFileContents.newDocument.a, 1);

        watcher.close();

        thisChangeStream.close(function(err) {
          assert.ifError(err);
          setTimeout(test.done, 1000);
        });
      });

      theCollection.insert({a: 1}, function(err) {
        assert.ifError(err);
      });
    });
  }
};

// This test currently fails because it seems that tailable/awaitdata cursors
// are not compatible with chained pipes (such as ChangeStream -> zlib -> file).
// Regular cursors do support chained pipes. Maybe ChangeStream's contained cursor
// is failing to emit some event that zlib is waiting on?
exports['Should support multiple piping of Change Streams'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var fs = require('fs');
    var zlib = require('zlib');
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');
      var theCollection = theDatabase.collection('pipeTest');
      var thisChangeStream = theCollection.watch(pipeline);

      var filename = '/tmp/_nodemongodbnative_stream_zlib_out.txt';
      var outStream = fs.createWriteStream(filename);
      var zlibTransformStream = zlib.createDeflate();

      // Make a stream transforming to JSON, compressing using zlib and piping to file
      thisChangeStream.stream({transform: JSON.stringify}).pipe(zlibTransformStream).pipe(outStream);

      // Listen for changes to the file
      var watcher = fs.watch(filename, function(eventType) {
        assert.equal(eventType, 'change');

        var fileContents = fs.readFileSync(filename, 'utf8');
        var parsedFileContents = JSON.parse(fileContents);
        assert.equal(parsedFileContents.newDocument.a, 1);

        watcher.close();

        thisChangeStream.close(function(err) {
          assert.ifError(err);
          setTimeout(test.done, 1000);
        });
      });

      theCollection.insert({a: 1}, function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should error when attempting to create a Change Stream against a stand-alone server'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {

    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      try {
        theDatabase.watch();
        assert.ok(false);
      } catch (e) {
        assert.equal(e.message, 'Change Stream are only supported on replica sets. The connected server does not appear to be a replica set.');
        test.done();
      }
    });
  }
};
