"use strict";

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode');
      collection.insert({'a':1}, {w: 1}, function(err, doc) {
        var adminDb = db.admin();        
        adminDb.addUser('admin', 'admin', configure.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          adminDb.authenticate('admin', 'admin', function(err, replies) {
            test.equal(null, err);
            test.equal(true, replies);

            adminDb.validateCollection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode', function(err, doc) {
              test.equal(null, err);
              test.ok(doc != null);

              adminDb.removeUser('admin', function(err) {
                test.equal(null, err);

                db.close();
                test.done();
              })
            });
          });                
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly issue authenticated event on successful authentication'] = {
  metadata: { requires: { topology: 'single' } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    db.once('authenticated', function() {
      test.done();
    });

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db  
    db.open(function(err, db) {
      // Grab a collection object
      var collection = db.collection('test');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insert({'a':1}, {w: 1}, function(err, doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin15', 'admin15', function(err, result) {
          test.equal(null, err);
          test.ok(result != null);

          // Authenticate using the newly added user
          adminDb.authenticate('admin15', 'admin15', function(err, result) {
            test.equal(null, err); 
            test.equal(true, result);            
            db.close();
          });
        });
      });
    });
    // DOC_END
  }
}