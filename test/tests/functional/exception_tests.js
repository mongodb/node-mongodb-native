/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownError = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyHandleThrownError', function(err, r) {
        try {
          db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
            debug(someUndefinedVariable);
          });        
        } catch (err) {
          test.ok(err != null);
          db.close();
          test.done();        
        }
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownErrorInRename = {
  metadata: {
    requires: {
      node: ">0.10.0"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    var domain = require('domain');
    var d = domain.create();
    d.on('error', function(err) {
      d.exit();
      d.dispose();
      test.done();
    })

    d.run(function() {
      db.open(function(err, db) {
        // Execute code
        db.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err, r) {      
          db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
            db.rename("shouldCorrectlyHandleThrownErrorInRename2", function(err, result) {
              debug(someUndefinedVariable);            
            })
          });        
        });
      });
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleExceptionsInCursorNext = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});

    process.once('uncaughtException', function(err) {
      test.ok(err != null);
      db.close();
      test.done();
    });

    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');
      col.insert({a:1}, function(err, result) {
        col.find().nextObject(function(err, result) {
          boom
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleExceptionsInCursorEach = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});

    process.once('uncaughtException', function(err) {
      test.ok(err != null);
      db.close();
      test.done();
    });

    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');
      col.insert({a:1}, function(err, result) {
        col.find().each(function(err, result) {
          boom
        });
      });
    });
  }
}