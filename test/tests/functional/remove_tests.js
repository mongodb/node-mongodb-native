/**
 * An example removing all documents in a collection not using safe mode
 *
 * @_class collection
 * @_function remove
 * @ignore
 */
exports.shouldRemoveAllDocumentsNoSafe = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch a collection to insert document into
    db.collection("remove_all_documents_no_safe", function(err, collection) {
      
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove();
        
        // Fetch all results
        collection.find().toArray(function(err, items) {
          test.equal(null, err);
          test.equal(0, items.length);
          db.close();
          test.done();
        });
      });
    })
  });  
  // DOC_END
}

/**
 * An example removing a subset of documents using safe mode to ensure removal of documents
 *
 * @_class collection
 * @_function remove
 * @ignore
 */
exports.shouldRemoveSubsetOfDocumentsSafeMode = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch a collection to insert document into
    db.collection("remove_subset_of_documents_safe", function(err, collection) {
      
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove({a:1}, {w:1}, function(err, numberOfRemovedDocs) {
          test.equal(null, err);
          test.equal(1, numberOfRemovedDocs);
          db.close();
          test.done();
        });        
      });
    })
  });  
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyClearOutCollection = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_clear', function(err, r) {
      db.collection('test_clear', function(err, collection) {
        collection.insert({i:1}, {w:1}, function(err, ids) {
          collection.insert({i:2}, {w:1}, function(err, ids) {
            collection.count(function(err, count) {
              test.equal(2, count);
              // Clear the collection
              collection.remove({}, {w:1}, function(err, result) {
                test.equal(2, result);
                
                collection.count(function(err, count) {
                  test.equal(0, count);
                  // Let's close the db
                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyRemoveDocumentUsingRegExp = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_remove_regexp', function(err, r) {
      db.collection('test_remove_regexp', function(err, collection) {
        collection.insert({address:'485 7th ave new york'}, {w:1}, function(err, ids) {
          // Clear the collection
          collection.remove({address:/485 7th ave/}, {w:1}, function(err, result) {
            test.equal(1, result);
            
            collection.count(function(err, count) {
              test.equal(0, count);
              // Let's close the db
              db.close();
              test.done();
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyRemoveOnlyFirstDocument = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyRemoveOnlyFirstDocument', function(err, r) {
      db.collection('shouldCorrectlyRemoveOnlyFirstDocument', function(err, collection) {
        collection.insert([{a:1}, {a:1}, {a:1}, {a:1}], {w:1}, function(err, result) {
          test.equal(null, err);
          
          // Remove the first
          collection.remove({a:1}, {w:1, single:true}, function(err, number) {
            test.equal(1, number);
            
            collection.find({a:1}).count(function(err, result) {
              test.equal(3, result);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  });
}