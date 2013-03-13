/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownError = function(configuration, test) {
  var db = configuration.db();
  
  db.createCollection('shouldCorrectlyHandleThrownError', function(err, r) {
    try {
      db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
        debug(someUndefinedVariable);
      });        
    } catch (err) {
      test.ok(err != null);
      test.done();        
    }
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownErrorInRename = function(configuration, test) {
  var db = configuration.db();
  // Catch unhandled exception
  process.on("uncaughtException", function(err) {
    // Remove listener
    process.removeAllListeners("uncaughtException");
    test.done()
  })
  
  // Execute code
  db.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err, r) {      
    db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
      db.rename("shouldCorrectlyHandleThrownErrorInRename2", function(err, result) {
        debug(someUndefinedVariable);            
      })
    });        
  });
}