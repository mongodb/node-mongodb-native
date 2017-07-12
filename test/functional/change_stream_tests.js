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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

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
            assert.equal(null, err);
            setTimeout(function() {
              test.done();
            }, 1100);
          });
        });

        // Trigger the second database event
        theDatabase.collection('docs').update({a:1}, {$inc: {a:2}}, function (err) {
          assert.equal(null, err);
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
        assert.equal(null, err);
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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.equal(null, err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.b, 2);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.ok(!(changeNotification.documentKey));
              assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

              // Trigger the second database event
              theDatabase.collection('docs').update({b:2}, {$inc: {b:2}}, function (err) {
                assert.equal(null, err);
                thisChangeStream.hasNext(function(err, hasNext) {
                  assert.equal(null, err);
                  assert.equal(true, hasNext);
                  thisChangeStream.next(function(err, changeNotification) {
                    assert.equal(null, err);
                    assert.equal(changeNotification.operationType, 'update');

                    // Close the change stream
                    thisChangeStream.close(function(err) {
                      assert.equal(null, err);
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

exports['Should create a Change Stream on a collection and emit change events'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {

    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.equal(null, err);

      var theCollection = client.db('integration_tests').collection('docs');

      var thisChangeStream = theCollection.changes(pipeline);

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
            assert.equal(null, err);
            setTimeout(function() {
              test.done();
            }, 1100);
          });
        });

        // Trigger the second database event
        theCollection.update({d:4}, {$inc: {d:2}}, function (err) {
          assert.equal(null, err);
        });
      });

      // Trigger the first database event
      theCollection.insert({d:4}, function (err) {
        assert.equal(null, err);
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
      assert.equal(null, err);

      var theCollection = client.db('integration_tests').collection('docs');

      var thisChangeStream = theCollection.changes(pipeline);

      // Trigger the first database event
      theCollection.insert({e:5}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.equal(null, err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.e, 5);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.ok(!(changeNotification.documentKey));
              assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.');

              // Trigger the second database event
              theCollection.update({e:5}, {$inc: {e:2}}, function (err) {
                assert.equal(null, err);
                thisChangeStream.hasNext(function(err, hasNext) {
                  assert.equal(null, err);
                  assert.equal(true, hasNext);
                  thisChangeStream.next(function(err, changeNotification) {
                    assert.equal(null, err);
                    assert.equal(changeNotification.operationType, 'update');
                    // Close the change stream
                    thisChangeStream.close(function(err) {
                      assert.equal(null, err);

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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream1 = theDatabase.changes([{ $addFields: { "changeStreamNumber": 1 } }]);
      var thisChangeStream2 = theDatabase.changes([{ $addFields: { "changeStreamNumber": 2 } }]);

      theDatabase.collection('docs').insert({c:3}, {w:"majority", j:true}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification from the first Change Stream
          thisChangeStream1.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream1.next(function(err, changeNotification) {
              assert.equal(null, err);
              assert.equal(changeNotification.operationType, 'insert');
              assert.equal(changeNotification.newDocument.c, 3);
              assert.equal(changeNotification.ns.db, 'integration_tests');
              assert.equal(changeNotification.ns.coll, 'docs');
              assert.equal(changeNotification.changeStreamNumber, 1);

              // Fetch the change notification from the second Change Stream
              thisChangeStream2.hasNext(function(err, hasNext) {
                assert.equal(null, err);
                assert.equal(true, hasNext);
                thisChangeStream2.next(function(err, changeNotification) {
                  assert.equal(null, err);
                  assert.equal(changeNotification.operationType, 'insert');
                  assert.equal(changeNotification.newDocument.c, 3);
                  assert.equal(changeNotification.ns.db, 'integration_tests');
                  assert.equal(changeNotification.ns.coll, 'docs');
                  assert.equal(changeNotification.changeStreamNumber, 2);

                  // Close the change streams
                  thisChangeStream1.close(function(err) {
                    assert.equal(null, err);
                    thisChangeStream2.close(function(err) {
                      assert.equal(null, err);
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
      assert.equal(null, err);
      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

      // Attach first event listener
      thisChangeStream.once('change', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert');

        // Check the cursor is open
        assert.equal(thisChangeStream.isClosed(), false);
        assert.equal(thisChangeStream.cursor.isClosed(), false);

        thisChangeStream.close(function(err) {
          assert.equal(null, err);

          // Check the cursor is closed
          assert.equal(thisChangeStream.isClosed(), true);
          assert.equal(thisChangeStream.cursor.isClosed(), true);
          test.done();
        });
      });

      // Trigger the first database event
      theDatabase.collection('docs').insert({a:1}, function (err) {
        assert.equal(null, err);
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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      try {
        theDatabase.changes([{$skip: 2}]);
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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, changeNotification) {
              assert.equal(null, err);
              assert.deepEqual(thisChangeStream.resumeToken(), changeNotification._id);

              // Close the change stream
              thisChangeStream.close(function(err) {
                assert.equal(null, err);
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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.equal(null, err);
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
            assert.equal(null, err);
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
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes(pipeline);

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
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);
      });
    });
  }
};

exports['Should error if resume token projected out of change stream document and disableResume is false'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes([{$project: {_id: false}}]);

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err) {
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

exports['Should not error if resume token projected out of change stream document and disableResume is true'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());
    client.connect(function(err, client) {
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      var thisChangeStream = theDatabase.changes([{$project: {_id: false}}], {disableResume: true});

      // Trigger the first database event
      theDatabase.collection('docs').insert({b:2}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

        setTimeout(function() {
          // Fetch the change notification
          thisChangeStream.hasNext(function(err, hasNext) {
            assert.equal(null, err);
            assert.equal(true, hasNext);
            thisChangeStream.next(function(err, doc) {
              assert.equal(err, null);
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

exports['Should error when attempting to create a Change Stream against a stand-alone server'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {

    var MongoClient = configuration.require.MongoClient;
    var client = new MongoClient(configuration.url());

    client.connect(function(err, client) {
      assert.equal(null, err);

      var theDatabase = client.db('integration_tests');

      try {
        theDatabase.changes();
        assert.ok(false);
      } catch (e) {
        assert.equal(e.message, 'Change Stream are only supported on replica sets. The connected server does not appear to be a replica set.');
        test.done();
      }
    });
  }
};
