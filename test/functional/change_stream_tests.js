var assert = require('assert');

// Define the pipeline processing changes
var pipeline = [
  { $addFields: { "addedField": "This is a field added using $addFields" } },
  { $project: { documentKey: false } },
  { $addFields: { "comment": "The documentKey field has been projected out of this document." } }
];

exports['Should create a Change Stream cursor on a database and emit change events'] = {
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

          // Close the cursor
          thisChangeStream.close(function(err) {
            assert.equal(null, err);
            setTimeout(function() {
              test.done();
            }, 2000);
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

exports['Should create a Change Stream cursor on a database and get change events through imperative callback form'] = {
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
      theDatabase.collection('docs').insert({b:2},{j:true}, function (err, result) {
        assert.equal(null, err);
        assert.equal(result.insertedCount, 1);

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
                  // Close the cursor
                  thisChangeStream.close(function(err) {
                    assert.equal(null, err);

                    // Close the cursor
                    thisChangeStream.close(function(err) {
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
        });
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
