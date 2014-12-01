"use strict";

exports.shouldStreamDocumentsWithPauseAndResumeForFetching = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = []
    var j = 0;

    for(var i = 0; i < 3000; i++) {
      docs.push({'a':i})
    }

    var allDocs = [];
    while(docs.length > 0) {
      allDocs.push(docs.splice(0, 1000));
    }

    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // Establish connection to db
    db.open(function(err, db) {
      db.createCollection('test_streaming_function_with_limit_for_fetching2', function(err, collection) {

        var left = allDocs.length;
        for(var i = 0; i < allDocs.length; i++) {
          collection.insert(allDocs[i], {w:1}, function(err, docs) {
            left = left - 1;

            if(left == 0) {
              // Peform a find to get a cursor
              var stream = collection.find({}).stream();
              var data = [];

              // For each data item
              stream.on("data", function(item) {
                data.push(1);
                j = j + 1;
                stream.pause()

                collection.findOne({}, function(err, result) {
                  stream.resume();
                })
              });

              // When the stream is done
              stream.on("end", function() {
                test.equal(3000, data.length);
                db.close();
                test.done();
              });              
            }
          });
        }
      });
    });
  }
}

exports.shouldStream10KDocuments = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;
    var docs = []

    for(var i = 0; i < 10000; i++) {
      docs.push({'a':i, bin: new Binary(new Buffer(256))})
    }

    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    var j = 0;

    var allDocs = [];
    while(docs.length > 0) {
      allDocs.push(docs.splice(0, 1000));
    }

    // Establish connection to db
    db.open(function(err, db) {
      db.createCollection('test_streaming_function_with_limit_for_fetching_2', function(err, collection) {

        var left = allDocs.length;
        for(var i = 0; i < allDocs.length; i++) {
          collection.insert(allDocs[i], {w:1}, function(err, docs) {
            left = left - 1;

            if(left == 0) {
              // Peform a find to get a cursor
              var stream = collection.find({}).stream();
              var data = [];

              // For each data item
              stream.on("data", function(item) {
                j = j + 1;
                stream.pause()
                data.push(1);

                collection.findOne({}, function(err, result) {
                  stream.resume();
                })
              });

              // When the stream is done
              stream.on("end", function() {
                test.equal(10000, data.length);
                db.close();
                test.done();
              });
            }
          });
        }
      });
    });
  }
}

exports.shouldTriggerMassiveAmountOfGetMores = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;
    var docs = []
    var counter = 0;
    var counter2 = 0;

    for(var i = 0; i < 1000; i++) {
      docs.push({'a':i, bin: new Binary(new Buffer(256))})
    }

    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // Establish connection to db
    db.open(function(err, db) {
      db.createCollection('test_streaming_function_with_limit_for_fetching_3', function(err, collection) {

        collection.insert(docs, {w:1}, function(err, ids) {
          // Peform a find to get a cursor
          var stream = collection.find({}).stream();
          var data = [];

          // For each data item
          stream.on("data", function(item) {
            counter++;
            stream.pause()
            stream.resume();
            counter2++;
          });

          // When the stream is done
          stream.on("end", function() {
            test.equal(1000, counter);
            test.equal(1000, counter2);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports.shouldStreamDocumentsAcrossGetMoreCommandAndCountCorrectly = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Binary = configuration.require.Binary;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var docs = []

      for(var i = 0; i < 2000; i++) {
        docs.push({'a':i, b: new Binary(new Buffer(1024))})
      }

      var allDocs = [];
      while(docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      var collection = db.collection('test_streaming_function_with_limit_for_fetching');
      var updateCollection = db.collection('test_streaming_function_with_limit_for_fetching_update');
      
      var left = allDocs.length;
      for(var i = 0; i < allDocs.length; i++) {
        collection.insert(allDocs[i], {w:1}, function(err, docs) {
          left = left - 1;

          if(left == 0) {
            var cursor = collection.find({});
            // Execute find on all the documents
            var stream = cursor.stream(); 

            stream.on('end', function() { 
              updateCollection.findOne({id:1}, function(err, doc) {
                test.equal(null, err);
                test.equal(2000, doc.count);

                db.close();
                test.done();
              })
            });

            stream.on('data',function(data){ 
              stream.pause();

              updateCollection.update({id: 1}, {$inc: {count: 1}}, {w:1, upsert:true}, function(err, result) {
                stream.resume();
              });
            }); 
          }
        });
      }
    });
  }
}