var assert = require('assert');

// Define the pipeline processing changes
var pipeline = [
  { $addFields: { "addedField": "This is a field added using $addFields" } },
  { $project: { documentKey: false } },
  { $addFields: { "comment": "The documentKey field has been projected out of this document." } }
];

exports['Should create a Change Stream on a database and emit change events'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('change', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.a, 1);
        assert.equal(changeNotification.ns.db, 'integration_tests');
        assert.equal(changeNotification.ns.coll, 'docs');
        assert.ok(!(changeNotification.documentKey));
        assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

        // Attach second event listener
        thisChangeStream.once('change', function(changeNotification) {
          assert.equal(changeNotification.operationType, 'update');
          assert.equal(changeNotification.updateDescription.updatedFields.a, 3);

          // Close the change stream
          thisChangeStream.close(function(err) {
            assert.ifError(err);
            setTimeout(function() {
              test.done();
            }, 1100);
          });
        });

        // Trigger the second database event
        theDatabase.collection('docs').update({a:1}, {$inc: {a:2}}, function (err) {
          assert.ifError(err);
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should create a Change Stream on a database and get change events through imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.ifError(err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.b, 2);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.ok(!(changeNotification.documentKey));
              assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

              // Trigger the second database event
              theDatabase.collection('docs').update({b:2}, {$inc: {b:2}}, function (err) {
                assert.ifError(err);
                thisChangeStream.hasNext(function(err, hasNext) {
                  assert.ifError(err);
                  assert.equal(true, hasNext);
                  thisChangeStream.next(function(err, changeNotification) {
                    assert.ifError(err);
                    assert.equal(changeNotification.operationType, 'update');

                    // Close the change stream
                    thisChangeStream.close(function(err) {
                      assert.ifError(err);
                      setTimeout(function() {
                        test.done();
                      }, 1100);
                    });
                  });
                });
              });
            });
          });
        }, 200);
      });
    });
  }
};

exports['Should create a Change Stream on a database and get change events through promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}).then(function (result) {
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
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.b, 2);
        assert.equal(changeNotification.ns.db, 'integration_tests');
        assert.equal(changeNotification.ns.coll, 'docs');
        assert.ok(!(changeNotification.documentKey));
        assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

        // Trigger the second database event
        return theDatabase.collection('docs').update({b:2}, {$inc: {b:2}});
      }).then(function () {
        return thisChangeStream.hasNext();
      }).then(function(hasNext) {
        assert.equal(true, hasNext);
        return thisChangeStream.next();
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'update');
        return thisChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should create a Change Stream on a collection and emit change events'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {

    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theCollection = client.db('integration_tests').collection('docs');

      var thisChangeStream = theCollection.watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('change', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.d, 4);
        assert.equal(changeNotification.ns.db, 'integration_tests');
        assert.equal(changeNotification.ns.coll, 'docs');
        assert.ok(!(changeNotification.documentKey));
        assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

        // Attach second event listener
        thisChangeStream.once('change', function(changeNotification) {
          assert.equal(changeNotification.operationType, 'update');
          assert.equal(changeNotification.updateDescription.updatedFields.d, 6);

          // Close the change stream
          thisChangeStream.close(function(err) {
            assert.ifError(err);
            setTimeout(function() {
              test.done();
            }, 1100);
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

      var theCollection = client.db('integration_tests').collection('docs');

      var thisChangeStream = theCollection.watch(pipeline);

      // Trigger the first database event
      theCollection.insert({e:5}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.ifError(err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.e, 5);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.ok(!(changeNotification.documentKey));
              assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

              // Trigger the second database event
              theCollection.update({e:5}, {$inc: {e:2}}, function (err) {
                assert.ifError(err);
                thisChangeStream.hasNext(function(err, hasNext) {
                  assert.ifError(err);
                  assert.equal(true, hasNext);
                  thisChangeStream.next(function(err, changeNotification) {
                    assert.ifError(err);
                    assert.equal(changeNotification.operationType, 'update');
                    // Close the change stream
                    thisChangeStream.close(function(err) {
                      assert.ifError(err);

                      setTimeout(function() {
                        test.done();
                      }, 1100);
                    });
                  });
                });
              });
            });
          });
        }, 200);
      });
    });
  }
};

exports['Should support creating multiple Change Streams of the same database'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream1 = theDatabase.watch([{ $addFields: { "changeStreamNumber": 1 } }]);
      var thisChangeStream2 = theDatabase.watch([{ $addFields: { "changeStreamNumber": 2 } }]);

      theDatabase.collection('docs').insert({c:3}, {w:"majority", j:true}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification from the first Change Stream
          thisChangeStream1.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream1.next(function(err, changeNotification) {
              assert.ifError(err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.c, 3);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.equal(changeNotification.watchtreamNumber, 1);

              // Fetch the change notification from the second Change Stream
              thisChangeStream2.hasNext(function(err, hasNext) {
                assert.ifError(err);
                assert.equal(true, hasNext);
                thisChangeStream2.next(function(err, changeNotification) {
                  assert.ifError(err);
                  assert.equal(changeNotification.operationType, 'insert');
                  assert.equal(changeNotification.newDocument.c, 3);
                  assert.equal(changeNotification.ns.db, 'integration_tests');
                  assert.equal(changeNotification.ns.coll, 'docs');
                  assert.equal(changeNotification.watchtreamNumber, 2);

                  // Close the change streams
                  thisChangeStream1.close(function(err) {
                    assert.ifError(err);
                    thisChangeStream2.close(function(err) {
                      assert.ifError(err);
                      setTimeout(function() {
                        test.done();
                      }, 2000);
                    });
                  });
                });
              });
            });
          });
        }, 200);
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

      var thisChangeStream = theDatabase.watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('change', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');

        // Check the cursor is open
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

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should error when attempting to create a Change Stream with a forbidden aggrgation pipeline stage'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      try {
        theDatabase.watch([{$skip: 2}]);
        assert.ok(false);
      } catch (e) {
        assert.equal(e.message, 'The pipeline contains the stage "$skip", which is not compatible with Change Streams at this time.');
        test.done();
      }
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

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.ifError(err);
              assert.deepEqual(thisChangeStream.resumeToken(), changeNotification._id);

              // Close the change stream
              thisChangeStream.close(function(err) {
                assert.ifError(err);
                setTimeout(function() {
                  test.done();
                }, 1100);
              });

            });
          });
        }, 200);
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

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext().then(function(hasNext) {
            assert.equal(true, hasNext);
            thisChangeStream.next().then(function(changeNotification) {
              assert.deepEqual(thisChangeStream.resumeToken(), changeNotification._id);

              // Close the change stream
              thisChangeStream.close().then(function() {
                setTimeout(function() {
                  test.done();
                }, 1100);
              });
            });
          }).catch(function(err) {
            assert.ifError(err);
          });
        }, 200);
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

      var thisChangeStream = theDatabase.watch(pipeline);

      thisChangeStream.once('change', function(changeNotification) {
        assert.deepEqual(thisChangeStream.resumeToken(), changeNotification._id);
        // Close the change stream
        thisChangeStream.close().then(function() {
          setTimeout(function() {
            test.done();
          }, 1100);
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
      });
    });
  }
};

exports['Should error if resume token projected out of change stream document and disableResume is false using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch([{$project: {_id: false}}]);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err) {
              assert.ok(err);
              assert.equal(err.message, 'A change stream document has been recieved that lacks a resume token (_id) and resumability has not been disabled for this change stream.');
              // Close the change stream
              thisChangeStream.close().then(function() {
                setTimeout(function() {
                  test.done();
                }, 1100);
              });
            });
          });
        }, 200);
      });
    });
  }
};

exports['Should error if resume token projected out of change stream document and disableResume is false using event listeners'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch([{$project: {_id: false}}]);

      // Fetch the change notification
      thisChangeStream.on('change', function() {
        assert.ok(false);
      });

      thisChangeStream.on('error', function(err) {
        assert.equal(err.message, 'A change stream document has been recieved that lacks a resume token (_id) and resumability has not been disabled for this change stream.');
        thisChangeStream.close(function() {
          setTimeout(test.done, 1100);
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);
      });

    });
  }
};

exports['Should not error if resume token projected out of change stream document and disableResume is true'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch([{$project: {_id: false}}], {disableResume: true});

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.ifError(err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.ifError(err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, doc) {
              assert.ifError(err);
              assert.equal(doc._id, null);
              assert.equal(doc.operationType, 'insert');

              // Close the change stream
              thisChangeStream.close().then(function() {
                setTimeout(function() {
                  test.done();
                }, 1100);
              });
            });
          });
        }, 200);
      });
    });
  }
};

exports['Should invalidate change stream on collection rename using event listeners'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Attach first event listener
      thisChangeStream.once('change', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.a, 1);
        assert.equal(changeNotification.ns.db, 'integration_tests');
        assert.equal(changeNotification.ns.coll, 'docs');
        assert.ok(!(changeNotification.documentKey));
        assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

        // Attach second event listener
        thisChangeStream.once('change', function(changeNotification) {
          // Check the cursor invalidation has occured
          assert.equal(changeNotification.operationType, 'invalidate');
          assert.equal(thisChangeStream.isClosed(), true);

          setTimeout(test.done, 1100);
        });

        // Trigger the second database event
        theDatabase.collection('docs').rename('renamedDocs', {dropTarget: true}, function (err) {
          assert.ifError(err);
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should invalidate change stream on database drop using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
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
              assert.equal(thisChangeStream.isClosed(), true);

              setTimeout(test.done, 1100);

            });
          });
        });
      });
    });
  }
};

exports['Should invalidate change stream on collection drop using promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.collection('docs').watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}).then(function () {
        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.next());
          }, 200);
        });
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        return theDatabase.dropCollection('docs');
      }).then(function() {
        return thisChangeStream.next();
      }).then(function(change) {
        // Check the cursor invalidation has occured
        assert.equal(change.operationType, 'invalidate');
        assert.equal(thisChangeStream.isClosed(), true);

        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should not invalidate change stream on entire database when collection drop occurs'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);

      // Trigger the first database event
      theDatabase.collection('aCollection').insert({a:1}).then(function () {
        // Fetch the change notification after a 200ms delay
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.next());
          }, 200);
        });
      }).then(function(change) {
        assert.equal(change.operationType, 'insert');
        return theDatabase.dropCollection('aCollection');
      }).then(function() {
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(theDatabase.collection('otherDocs').insert({b:2}));
          }, 200);
        });
      }).then(function() {
        return new theDatabase.s.promiseLibrary(function (resolve) {
          setTimeout(function(){
            resolve(thisChangeStream.next());
          }, 200);
        });
      }).then(function(change) {
        // Check the cursor invalidation has not occured
        assert.equal(change.operationType, 'insert');
        assert.equal(thisChangeStream.isClosed(), false);

        return thisChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  }
};

exports['Should resume connection when a MongoNetworkError is encountered using promises'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);
      thisChangeStream.cursor.initialCursor = true;

      // Insert three documents in order, the second of which will cause the simulator to trigger a MongoNetworkError
      theDatabase.collection('docs').insertOne({a: 1}).then(function() {
        return theDatabase.collection('docs').insertOne({shouldThrowMongoNetworkError: true});
      }).then(function() {
        return theDatabase.collection('docs').insertOne({b: 2});
      }).then(function() {
        return thisChangeStream.next();
      }).then(function(change) {
        // Check the cursor is the initial cursor
        assert.equal(thisChangeStream.cursor.initialCursor, true);

        // Check the document is the document we are expecting
        assert.ok(change);
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.a, 1);
        assert.deepEqual(thisChangeStream.resumeToken(), change._id);

        // Get the next change stream document. This will cause the simulator to trigger a MongoNetworkError, and therefore attempt to reconnect
        return thisChangeStream.next();
      }).then(function(change) {
        // Check a new cursor has been established
        assert.notEqual(thisChangeStream.cursor.initialCursor, true);

        // The next document should be the one after the shouldThrowMongoNetworkError document
        assert.ok(change);
        assert.equal(change.operationType, 'insert');
        assert.equal(change.newDocument.b, 2);
        assert.deepEqual(thisChangeStream.resumeToken(), change._id);

        // Close the change stream
        thisChangeStream.close(function(err) {
          assert.ifError(err);
          setTimeout(test.done, 1100);
        });
      }).catch(function(err) {
        throw err;
      });

    });
  }
};

exports['Should resume connection when a MongoNetworkError is encountered using imperative callback form'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.ifError(err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.watch(pipeline);
      thisChangeStream.cursor.initialCursor = true;

      // Insert three documents in order, the second of which will cause the simulator to trigger a MongoNetworkError
      theDatabase.collection('docs').insertOne({a: 1}, function(err) {
        assert.ifError(err);
        theDatabase.collection('docs').insertOne({shouldThrowMongoNetworkError: true}, function(err) {
          assert.ifError(err);
          theDatabase.collection('docs').insertOne({b: 2}, function(err) {
            assert.ifError(err);
            thisChangeStream.next(function(err, change) {
              assert.ifError(err);

              // Check the document is the document we are expecting
              assert.ok(change);
              assert.equal(change.operationType, 'insert');
              assert.equal(change.newDocument.a, 1);
              assert.deepEqual(thisChangeStream.resumeToken(), change._id);

              // Get the next change stream document. This will cause the simulator to trigger a MongoNetworkError, and therefore attempt to reconnect
              thisChangeStream.next(function(err, change) {
                assert.ifError(err);
                // Check a new cursor has been established
                assert.notEqual(thisChangeStream.cursor.initialCursor, true);

                // The next document should be the one after the shouldThrowMongoNetworkError document
                assert.ok(change);
                assert.equal(change.operationType, 'insert');
                assert.equal(change.newDocument.b, 2);
                assert.deepEqual(thisChangeStream.resumeToken(), change._id);

                // Close the change stream
                thisChangeStream.close(function(err) {
                  assert.ifError(err);
                  setTimeout(test.done, 1100);
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
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.f, 6);

        // Save the resumeToken
        resumeToken = changeNotification._id;

        return thisFirstChangeStream.next();
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.g, 7);

        return thisFirstChangeStream.next();
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.h, 8);

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
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.g, 7);

        return thisSecondChangeStream.next();
      }).then(function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');
        assert.equal(changeNotification.newDocument.h, 8);

        return thisSecondChangeStream.close();
      }).then(function() {
        setTimeout(test.done, 1100);
      }).catch(function(err) {
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
