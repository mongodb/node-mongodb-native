/**
 * @ignore
 */
exports.shouldCorrectlyRetrieveErrorMessagesFromServer = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {    
    // Just run with one connection in the pool
    var error_client = configuration.newDbInstance({w:1}, {poolSize:1});
    // Open the db
    error_client.open(function(err, error_client) {
      error_client.resetErrorHistory(function() {
        error_client.error(function(err, documents) {
          test.equal(true, documents[0].ok);
          test.equal(0, documents[0].n);

          // Force error on server
          error_client.executeDbCommand({forceerror: 1}, function(err, r) {
            test.equal(0, r.documents[0].ok);
            test.ok(r.documents[0].errmsg.length > 0);

            // Check for previous errors
            error_client.previousErrors(function(err, documents) {
              test.equal(true, documents[0].ok);
              test.equal(1, documents[0].nPrev);
              test.equal("forced error", documents[0].err);

              // Check for the last error
              error_client.error(function(err, documents) {
                test.equal("forced error", documents[0].err);

                // Force another error
                var collection = error_client.collection('test_error_collection');
                collection.findOne({name:"Fred"}, function(err, document) {
                  
                  // Check that we have two previous errors
                  error_client.previousErrors(function(err, documents) {
                    test.equal(true, documents[0].ok);
                    test.equal(2, documents[0].nPrev);
                    test.equal("forced error", documents[0].err);

                    error_client.resetErrorHistory(function() {
                      error_client.previousErrors(function(err, documents) {
                        test.equal(true, documents[0].ok);
                        test.equal(-1, documents[0].nPrev);

                        error_client.error(function(err, documents) {                            
                          test.equal(true, documents[0].ok);
                          test.equal(0, documents[0].n);

                          // Let's close the db
                          error_client.close();

                          error_client.error(function(err, documents) {
                            test.ok(err instanceof Error);
                            test.equal('Connection was destroyed by application', err.message);
                            test.done();
                          });
                        });
                      })
                    });
                  });
                });
              })
            });
          });
        });
      });
    });    
  }
}

// Test the last status functionality of the driver
exports.shouldCorrectlyExecuteLastStatus = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.getMongoPackage().Collection;
    // Just run with one connection in the pool
    var error_client = configuration.newDbInstance({w:0}, {poolSize:1});
    // Open the db
    error_client.open(function(err, client) {
      var collection = client.collection('test_last_status');
      test.ok(collection instanceof Collection);
      test.equal('test_last_status', collection.collectionName);

      // Get the collection
      var collection = client.collection('test_last_status');
      // Remove all the elements of the collection
      collection.remove(function(err, result) {          
        // Check update of a document
        collection.insert({i:1}, function(err, ids) {
          test.equal(1, ids.length);
          test.ok(ids[0]._id.toHexString().length == 24);

          // Update the record
          collection.update({i:1}, {"$set":{i:2}}, function(err, result) {
            // Check for the last message from the server
            client.lastStatus(function(err, status) {
              test.equal(true, status[0].ok);
              test.equal(true, status[0].updatedExisting);
              // Check for failed update of document
              collection.update({i:1}, {"$set":{i:500}}, function(err, result) {
                client.lastStatus(function(err, status) {
                  test.equal(true, status[0].ok);
                  test.equal(false, status[0].updatedExisting);

                  // Check safe update of a document
                  collection.insert({x:1}, function(err, ids) {
                    collection.update({x:1}, {"$set":{x:2}}, {'safe':true}, function(err, document) {
                    });
                  
                    collection.update({x:1}, {"$set":{x:2}});

                    collection.update({y:1}, {"$set":{y:2}}, {'safe':true}, function(err, result) {
                      test.equal(0, result);

                      // Let's close the db
                      error_client.close();
                      // Let's close the db
                      test.done();
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
}

exports.shouldFailInsertDueToUniqueIndex = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var collection = db.collection('test_failing_insert_due_to_unique_index');
    collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
      collection.insert({a:2}, {safe: true}, function(err, r) {
        test.ok(err == null);
        collection.insert({a:2}, {safe: true}, function(err, r) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  });
}

// Test the error reporting functionality
exports.shouldFailInsertDueToUniqueIndexStrict = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.dropCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
      db.createCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
        db.collection('test_failing_insert_due_to_unique_index_strict', function(err, collection) {
          collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
            collection.insert({a:2}, {w:1}, function(err, r) {
              test.ok(err == null);
              collection.insert({a:2}, {w:1}, function(err, r) {
                test.ok(err != null);
                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  });
}

exports['safe mode should pass the disconnected error to the callback'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var error_client = configuration.newDbInstance({w:0}, {poolSize:1});
    var name = 'test_safe_mode_when_disconnected';
    error_client.open(function(err, error_client) {
      test.ok(err == null);
      error_client.resetErrorHistory(function() {
        error_client.dropCollection(name, function() {
          
          var collection = error_client.collection(name);        
          collection.insert({ inserted: true }, { safe: true }, function (err) {
            test.ok(err == null);
            error_client.close();

            collection.insert({ works: true }, { safe: true }, function (err) {
              test.ok(err instanceof Error);
              test.equal('Connection was destroyed by application', err.message);

              collection.update({ inserted: true }, { inserted: true, x: 1 }, { safe: true }, function (err) {
                test.ok(err instanceof Error);
                test.equal('Connection was destroyed by application', err.message);

                collection.remove({ inserted: true }, { safe: true }, function (err) {
                  test.ok(err instanceof Error);
                  test.equal('Connection was destroyed by application', err.message);

                  collection.findOne({ works: true }, function (err) {
                    test.ok(err instanceof Error);
                    test.equal('Connection was destroyed by application', err.message);
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
}

exports['mixing included and excluded fields should return an error object with message'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var c = db.collection('test_error_object_should_include_message');
    c.insert({a:2, b: 5}, {w:1}, function(err, r) {
      test.equal(err, null);
      
      c.findOne({a:2}, {fields: {a:1, b:0}}, function(err) {
        test.ok(err);
        test.equal('object', typeof err);
        var rgx = /You cannot currently mix including and excluding fields/;
        test.ok(rgx.test(err.message), 'missing error message property');
        db.close();
        test.done();
      });
    });
  });
}

exports['should handle error throw in user callback'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  process.once("uncaughtException", function(err) {
    db.close();
    test.done();
  })

  db.open(function(err, client) {
    var c = db.collection('test_error_object_should_include_message');
    c.findOne({}, function() {
      ggg
    })
  });
}

exports['Should handle uncaught error correctly'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  process.once("uncaughtException", function(err) {
    db.close();
    test.done();
  })

  db.open(function(err, db) {
    testdfdma();
    test.ok(false);
  });
}

exports['Should handle throw error in db operation correctly'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    process.once("uncaughtException", function(err) {
      db.close();
      test.done();
    })

    db.collection('t').findOne(function() {
      testdfdma();
    });
  });
}

exports['Should handle MongoClient uncaught error correctly'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {node: ">0.10.0"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.getMongoPackage().MongoClient;
    var domain = require('domain');
    var d = domain.create();
    d.on('error', function(err) {
      test.done()
    })

    d.run(function() {
      MongoClient.connect(configuration.url(), function(err, db) {
        testdfdma();
        test.ok(false);
      });
    })
  }
}

exports['Should handle MongoClient throw error in db operation correctly'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;
  MongoClient.connect(configuration.url(), function(err, db) {
    process.once("uncaughtException", function(err) {
      db.close();
      test.done();
    })

    db.collection('t').findOne(function() {
      testdfdma();
    });
  });
}
