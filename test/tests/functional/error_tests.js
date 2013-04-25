/**
 * @ignore
 */
exports.shouldCorrectlyRetrieveErrorMessagesFromServer = function(configuration, test) {    
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
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

// Test the last status functionality of the driver
exports.shouldCorrectlyExecuteLastStatus = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
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

exports.shouldFailInsertDueToUniqueIndex = function(configuration, test) {
  var client = configuration.db();

  var collection = client.collection('test_failing_insert_due_to_unique_index');
  collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
    collection.insert({a:2}, {safe: true}, function(err, r) {
      test.ok(err == null);
      collection.insert({a:2}, {safe: true}, function(err, r) {
        test.ok(err != null);
        test.done();
      })
    })
  })
}

// Test the error reporting functionality
exports.shouldFailInsertDueToUniqueIndexStrict = function(configuration, test) {
  var error_client = configuration.db();

  error_client.dropCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
    error_client.createCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
      error_client.collection('test_failing_insert_due_to_unique_index_strict', function(err, collection) {
        collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
          collection.insert({a:2}, {w:1}, function(err, r) {
            test.ok(err == null);
            collection.insert({a:2}, {w:1}, function(err, r) {
              test.ok(err != null);
              test.done();
            });
          });
        });
      });
    });
  });
}

exports['safe mode should pass the disconnected error to the callback'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
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

exports.shouldHandleAssertionError = function(configuration, test) {
  var client = configuration.db();

  client.admin().serverInfo(function(err, result){
    var collection = client.collection('test_handle_assertion_error');
    collection.insert({a:{lat:50, lng:10}}, {safe: true}, function(err, docs) {
      test.ok(err == null);

      var query = {a:{$within:{$box:[[1,-10],[80,120]]}}};

      // We don't have a geospatial index at this point
      collection.findOne(query, function(err, docs) {
        if(parseInt((result.version.replace(/\./g, ''))) < 223) test.ok(err instanceof Error);
        
        collection.ensureIndex([['a', '2d' ]], {unique:true, w:1}, function(err, indexName) {
          test.ok(err == null);
          
          collection.findOne(query, function(err, doc) {
            test.ok(err == null);
            
            var invalidQuery = {a:{$within:{$box:[[-10,-180],[10,180]]}}};

            collection.findOne(invalidQuery, function(err, doc) {
              if(parseInt((result.version.replace(/\./g, ''))) < 200) {
                test.ok(err instanceof Error);
              } else {                        
                test.equal(null, err);
                test.equal(null, doc);
              }

              test.done();
            });  
          });
        });
      });          
    });
  });
}

exports['mixing included and excluded fields should return an error object with message'] = function(configuration, test) {
  var client = configuration.db();

  var c = client.collection('test_error_object_should_include_message');
  c.insert({a:2, b: 5}, {w:1}, function(err, r) {
    test.equal(err, null);
    
    c.findOne({a:2}, {fields: {a:1, b:0}}, function(err) {
      test.ok(err);
      test.equal('object', typeof err);
      var rgx = /You cannot currently mix including and excluding fields/;
      test.ok(rgx.test(err.message), 'missing error message property');
      test.done();
    });
  });
}