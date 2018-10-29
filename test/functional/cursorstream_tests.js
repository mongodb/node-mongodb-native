'use strict';
var expect = require('chai').expect;
var Buffer = require('safe-buffer').Buffer;

describe('Cursor Streams', function() {
  before(function() {
    var dbName = this.configuration.db;
    var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      poolSize: 1
    });

    return client.connect().then(function() {
      var db = client.db(dbName);
      return db.dropDatabase();
    });
  });

  it('should stream documents with pause and resume for fetching', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var docs = [];
      var j = 0;

      for (var i = 0; i < 3000; i++) {
        docs.push({ a: i });
      }

      var allDocs = [];
      while (docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        db.createCollection('test_streaming_function_with_limit_for_fetching2', function(
          err,
          collection
        ) {
          var left = allDocs.length;
          for (var i = 0; i < allDocs.length; i++) {
            collection.insert(allDocs[i], { w: 1 }, function(err) {
              expect(err).to.not.exist;

              left = left - 1;

              if (left === 0) {
                // Perform a find to get a cursor
                var stream = collection.find({}).stream();
                var data = [];

                // For each data item
                stream.on('data', function() {
                  data.push(1);
                  j = j + 1;
                  stream.pause();

                  collection.findOne({}, function(err) {
                    expect(err).to.not.exist;
                    stream.resume();
                  });
                });

                // When the stream is done
                stream.on('end', function() {
                  setTimeout(() => {
                    let err;
                    try {
                      expect(data).to.have.length(3000);
                    } catch (e) {
                      err = e;
                    }
                    client.close();
                    done(err);
                  }, 1000);
                });
              }
            });
          }
        });
      });
    }
  });

  it('should stream 10K documents', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var Binary = self.configuration.require.Binary;
      var docs = [];

      for (var i = 0; i < 10000; i++) {
        docs.push({ a: i, bin: new Binary(Buffer.alloc(256)) });
      }

      var j = 0;

      var allDocs = [];
      while (docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        db.createCollection('test_streaming_function_with_limit_for_fetching_2', function(
          err,
          collection
        ) {
          var left = allDocs.length;
          for (var i = 0; i < allDocs.length; i++) {
            collection.insert(allDocs[i], { w: 1 }, function(err) {
              expect(err).to.not.exist;
              left = left - 1;

              if (left === 0) {
                // Perform a find to get a cursor
                var stream = collection.find({}).stream();
                var data = [];

                // For each data item
                stream.on('data', function() {
                  j = j + 1;
                  stream.pause();
                  data.push(1);

                  collection.findOne({}, function(err) {
                    expect(err).to.not.exist;
                    stream.resume();
                  });
                });

                // When the stream is done
                stream.on('end', function() {
                  setTimeout(() => {
                    let err;
                    try {
                      expect(data).to.have.length(10000);
                    } catch (e) {
                      err = e;
                    }
                    client.close();
                    done(err);
                  }, 1000);
                });
              }
            });
          }
        });
      });
    }
  });

  it('should trigger massive amount of getMores', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var Binary = self.configuration.require.Binary;
      var docs = [];
      var counter = 0;
      var counter2 = 0;

      for (var i = 0; i < 1000; i++) {
        docs.push({ a: i, bin: new Binary(Buffer.alloc(256)) });
      }

      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        db.createCollection('test_streaming_function_with_limit_for_fetching_3', function(
          err,
          collection
        ) {
          collection.insert(docs, { w: 1 }, function(err) {
            expect(err).to.not.exist;

            // Perform a find to get a cursor
            var stream = collection.find({}).stream();

            // For each data item
            stream.on('data', function() {
              counter++;
              stream.pause();
              stream.resume();
              counter2++;
            });

            // When the stream is done
            stream.on('end', function() {
              expect(counter).to.equal(1000);
              expect(counter2).to.equal(1000);
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('should stream documents across getMore command and count correctly', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this,
        Binary = self.configuration.require.Binary;

      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];

        for (var i = 0; i < 2000; i++) {
          docs.push({ a: i, b: new Binary(Buffer.alloc(1024)) });
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
        for (i = 0; i < allDocs.length; i++) {
          collection.insert(allDocs[i], { w: 1 }, function(err) {
            expect(err).to.not.exist;
            left = left - 1;

            if (left === 0) {
              var cursor = collection.find({});
              // Execute find on all the documents
              var stream = cursor.stream();

              stream.on('end', function() {
                updateCollection.findOne({ id: 1 }, function(err, doc) {
                  expect(err).to.not.exist;
                  expect(doc.count).to.equal(2000);

                  client.close();
                  done();
                });
              });

              stream.on('data', function() {
                stream.pause();

                updateCollection.update(
                  { id: 1 },
                  { $inc: { count: 1 } },
                  { w: 1, upsert: true },
                  function(err) {
                    expect(err).to.not.exist;
                    stream.resume();
                  }
                );
              });
            }
          });
        }
      });
    }
  });

  it('should correctly error out stream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var cursor = db.collection('myCollection').find({
          timestamp: { $ltx: '1111' } // Error in query.
        });

        var error, streamIsClosed;

        cursor.on('error', function(err) {
          error = err;
        });

        cursor.on('close', function() {
          expect(error).to.exist;
          streamIsClosed = true;
        });

        cursor.on('end', function() {
          expect(error).to.exist;
          expect(streamIsClosed).to.be.true;
          client.close();
          done();
        });

        cursor.pipe(process.stdout);
      });
    }
  });

  it('should correctly stream cursor after stream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];
        var received = [];

        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i, field: 'hello world' });
        }

        db.collection('cursor_sort_stream').insertMany(docs, function(err) {
          expect(err).to.not.exist;

          var cursor = db
            .collection('cursor_sort_stream')
            .find({})
            .project({ a: 1 })
            .sort({ a: -1 });

          cursor.on('end', function() {
            expect(received).to.have.length(1000);

            client.close();
            done();
          });

          cursor.on('data', function(d) {
            received.push(d);
          });
        });
      });
    }
  });
});
