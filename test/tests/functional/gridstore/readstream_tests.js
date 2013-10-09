/**
 * A simple example showing the use of the readstream pause function.
 *
 * @_class readstream
 * @_function pause
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamPauseFunction = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w", {chunk_size:5});
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Check if stream is paused
              test.equal(false, stream.paused);
              // Pause stream
              stream.pause();
              // Restart the stream after 1 miliscecond
              setTimeout(function() {
                stream.resume();
              }, 100);          
            });

            // For each data item
            stream.on("end", function(item) {
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
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the readstream resume function.
 *
 * @_class readstream
 * @_function resume
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamResumeFunction = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w", {chunk_size:5});
    file.open(function(err, file) {      
      // Write some content and flush to disk
      var fileBody = 'Hello world';
      file.write(fileBody, function(err, file) {        
        file.close(function(err, result) {
          // Let's create a read file
          file = new GridStore(db, fileId, "r");

          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream(true);

            // Pause the stream initially
            stream.pause();

            // Save read content here
            var fileBuffer = '';

            // For each data item
            stream.on("data", function(item) {
              // Check if stream is paused
              test.equal(false, stream.paused);
              // Pause stream
              stream.pause();

              fileBuffer += item.toString('utf8');

              // Restart the stream after 1 miliscecond
              setTimeout(function() {
                stream.resume();
              }, 100);
            });

            // For each data item
            stream.on("end", function(item) {
            });

            // When the stream is done
            stream.on("close", function() {
              // Have we received the same file back?
              test.equal(fileBuffer, fileBody);
              db.close();
              test.done();          
            });     

            // Resume the stream
            stream.resume();
          });
        });        
      });      
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the readstream destroy function.
 *
 * @_class readstream
 * @_function destroy
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamDestroyFunction = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w");
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Destroy the stream
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
    });
  });
  // DOC_END
}