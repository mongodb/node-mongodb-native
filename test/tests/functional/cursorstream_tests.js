/**
 * A simple example showing the use of the cursorstream pause function.
 *
 * @_class cursorstream
 * @_function pause
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamPauseFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_pause', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find().stream();

        // For each data item
        stream.on("data", function(item) {
          // Check if cursor is paused
          test.equal(false, stream.paused);
          // Pause stream
          stream.pause();
          // Check if cursor is paused
          test.equal(true, stream.paused);

          // Restart the stream after 1 miliscecond
          setTimeout(function() {
            stream.resume();
            // Check if cursor is paused
            process.nextTick(function() {
              test.equal(false, stream.paused);
            })
          }, 1);
        });

        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the cursorstream resume function.
 *
 * @_class cursorstream
 * @_function resume
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamResumeFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_resume', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find().stream();

        // For each data item
        stream.on("data", function(item) {
          // Check if cursor is paused
          test.equal(false, stream.paused);
          // Pause stream
          stream.pause();
          // Check if cursor is paused
          test.equal(true, stream.paused);

          // Restart the stream after 1 miliscecond
          setTimeout(function() {

            // Resume the stream
            stream.resume();

            // Check if cursor is paused
            process.nextTick(function() {
              test.equal(false, stream.paused);
            });
          }, 1);
        });

        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the cursorstream resume function.
 *
 * @_class cursorstream
 * @_function destroy
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamDestroyFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_destroy', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find().stream();

        // For each data item
        stream.on("data", function(item) {
          // Destroy stream
          stream.destroy();
        });

        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

exports.shouldStreamDocumentsWithPauseAndResumeForFetching = function(configuration, test) {
  var docs = []

  for(var i = 0; i < 3000; i++) {
    docs.push({'a':i})
  }

  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // Establish connection to db
  db.open(function(err, db) {
    db.createCollection('test_streaming_function_with_limit_for_fetching2', function(err, collection) {

      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find({}).stream();
        var data = [];

        // For each data item
        stream.on("data", function(item) {
          stream.pause()

          collection.findOne({}, function(err, result) {
            data.push(1);
            stream.resume();
          })
        });

        // When the stream is done
        stream.on("close", function() {
          test.equal(3000, data.length);
          db.close();
          test.done();
        });
      });
    });
  });
}

exports.shouldStream10KDocuments = function(configuration, test) {
  var Binary = configuration.getMongoPackage().Binary;
  var docs = []

  for(var i = 0; i < 10000; i++) {
    docs.push({'a':i, bin: new Binary(new Buffer(256))})
  }

  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // Establish connection to db
  db.open(function(err, db) {
    db.createCollection('test_streaming_function_with_limit_for_fetching_2', function(err, collection) {

      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find({}).stream();
        var data = [];

        // For each data item
        stream.on("data", function(item) {
          stream.pause()

          collection.findOne({}, function(err, result) {
            data.push(1);
            stream.resume();
          })
        });

        // When the stream is done
        stream.on("close", function() {
          test.equal(10000, data.length);
          db.close();
          test.done();
        });
      });
    });
  });
}

exports.shouldTriggerMassiveAmountOfGetMores = function(configuration, test) {
  var Binary = configuration.getMongoPackage().Binary;
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
        stream.on("close", function() {
          test.equal(1000, counter);
          test.equal(1000, counter2);
          db.close();
          test.done();
        });
      });
    });
  });
}

exports.shouldStreamDocumentsAcrossGetMoreCommandAndCountCorrectly = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID
    , Binary = configuration.getMongoPackage().Binary;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var docs = []

    for(var i = 0; i < 2000; i++) {
      docs.push({'a':i, b: new Binary(new Buffer(1024))})
    }

    var collection = db.collection('test_streaming_function_with_limit_for_fetching');
    var updateCollection = db.collection('test_streaming_function_with_limit_for_fetching_update');
    
    // Insert the docs
    collection.insert(docs, {w:1}, function(err, ids) {        
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
    });
  });
}
