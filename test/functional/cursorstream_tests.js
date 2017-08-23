'use strict';

exports.shouldStreamDocumentsWithPauseAndResumeForFetching = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = [];
    var j = 0;

    for (var i = 0; i < 3000; i++) {
      docs.push({ a: i });
    }

    var allDocs = [];
    while (docs.length > 0) {
      allDocs.push(docs.splice(0, 1000));
    }

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      db.createCollection('test_streaming_function_with_limit_for_fetching2', function(
        err,
        collection
      ) {
        var left = allDocs.length;
        for (var i = 0; i < allDocs.length; i++) {
          collection.insert(allDocs[i], { w: 1 }, function(err, docs) {
            left = left - 1;

            if (left == 0) {
              // Perform a find to get a cursor
              var stream = collection.find({}).stream();
              var data = [];

              // For each data item
              stream.on('data', function(item) {
                data.push(1);
                j = j + 1;
                stream.pause();

                collection.findOne({}, function(err, result) {
                  stream.resume();
                });
              });

              // When the stream is done
              stream.on('end', function() {
                test.equal(3000, data.length);
                client.close();
                test.done();
              });
            }
          });
        }
      });
    });
  }
};

exports.shouldStream10KDocuments = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;
    var docs = [];

    for (var i = 0; i < 10000; i++) {
      docs.push({ a: i, bin: new Binary(new Buffer(256)) });
    }

    var j = 0;

    var allDocs = [];
    while (docs.length > 0) {
      allDocs.push(docs.splice(0, 1000));
    }

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      db.createCollection('test_streaming_function_with_limit_for_fetching_2', function(
        err,
        collection
      ) {
        var left = allDocs.length;
        for (var i = 0; i < allDocs.length; i++) {
          collection.insert(allDocs[i], { w: 1 }, function(err, docs) {
            left = left - 1;

            if (left == 0) {
              // Perform a find to get a cursor
              var stream = collection.find({}).stream();
              var data = [];

              // For each data item
              stream.on('data', function(item) {
                j = j + 1;
                stream.pause();
                data.push(1);

                collection.findOne({}, function(err, result) {
                  stream.resume();
                });
              });

              // When the stream is done
              stream.on('end', function() {
                test.equal(10000, data.length);
                client.close();
                test.done();
              });
            }
          });
        }
      });
    });
  }
};

exports.shouldTriggerMassiveAmountOfGetMores = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;
    var docs = [];
    var counter = 0;
    var counter2 = 0;

    for (var i = 0; i < 1000; i++) {
      docs.push({ a: i, bin: new Binary(new Buffer(256)) });
    }

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      db.createCollection('test_streaming_function_with_limit_for_fetching_3', function(
        err,
        collection
      ) {
        collection.insert(docs, { w: 1 }, function(err, ids) {
          // Perform a find to get a cursor
          var stream = collection.find({}).stream();
          var data = [];

          // For each data item
          stream.on('data', function(item) {
            counter++;
            stream.pause();
            stream.resume();
            counter2++;
          });

          // When the stream is done
          stream.on('end', function() {
            test.equal(1000, counter);
            test.equal(1000, counter2);
            client.close();
            test.done();
          });
        });
      });
    });
  }
};

exports.shouldStreamDocumentsAcrossGetMoreCommandAndCountCorrectly = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID,
      Binary = configuration.require.Binary;

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var docs = [];

      for (var i = 0; i < 2000; i++) {
        docs.push({ a: i, b: new Binary(new Buffer(1024)) });
      }

      var allDocs = [];
      while (docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      var collection = db.collection('test_streaming_function_with_limit_for_fetching');
      var updateCollection = db.collection(
        'test_streaming_function_with_limit_for_fetching_update'
      );

      var left = allDocs.length;
      for (var i = 0; i < allDocs.length; i++) {
        collection.insert(allDocs[i], { w: 1 }, function(err, docs) {
          left = left - 1;

          if (left == 0) {
            var cursor = collection.find({});
            // Execute find on all the documents
            var stream = cursor.stream();

            stream.on('end', function() {
              updateCollection.findOne({ id: 1 }, function(err, doc) {
                test.equal(null, err);
                test.equal(2000, doc.count);

                client.close();
                test.done();
              });
            });

            stream.on('data', function(data) {
              stream.pause();

              updateCollection.update(
                { id: 1 },
                { $inc: { count: 1 } },
                { w: 1, upsert: true },
                function(err, result) {
                  stream.resume();
                }
              );
            });
          }
        });
      }
    });
  }
};

exports['should correctly error out stream'] = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var cursor = db.collection('myCollection').find({
        timestamp: { $ltx: '1111' } // Error in query.
      });

      var error, streamIsClosed;

      cursor.on('error', function(err) {
        error = err;
      });

      cursor.on('close', function() {
        test.ok(error !== undefined && error !== null);
        streamIsClosed = true;
      });

      cursor.on('end', function() {
        test.ok(error !== undefined && error !== null);
        test.ok(streamIsClosed === true);
        client.close();
        test.done();
      });

      cursor.pipe(process.stdout);
    });
  }
};

exports['should correctly stream cursor after stream'] = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var docs = [];
      var received = [];

      for (var i = 0; i < 1000; i++) {
        docs.push({ a: i, field: 'hello world' });
      }

      db.collection('cursor_sort_stream').insertMany(docs, function(err) {
        test.equal(null, err);

        var cursor = db.collection('cursor_sort_stream').find({}).project({ a: 1 }).sort({ a: -1 });

        cursor.on('end', function() {
          test.equal(1000, received.length);

          client.close();
          test.done();
        });

        cursor.on('data', function(d) {
          received.push(d);
        });
      });
    });
  }
};
