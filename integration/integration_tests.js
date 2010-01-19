require.paths.unshift("./lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");
require("mongodb/db");
require("mongodb/bson/bson");

/*******************************************************************************************************
  Integration Tests
*******************************************************************************************************/

// Test the creation of a collection on the mongo db
function test_collection_methods() {
  client.createCollection(function(collection) {
    // Verify that all the result are correct coming back (should contain the value ok)
    test.assertTrue(collection instanceof Collection);
    test.assertEquals('test_collection_methods', collection.collectionName);
    // Let's check that the collection was created correctly
    client.collectionNames(function(documents) {
      var found = false;
      documents.forEach(function(document) {
        if(document.name == "integration_tests_.test_collection_methods") found = true;
      });      
      test.assertTrue(true, found);
      // Rename the collection and check that it's gone
      client.renameCollection("test_collection_methods", "test_collection_methods2", function(replies) {
        test.assertEquals(1, replies[0].documents[0].get('ok'));
        // Drop the collection and check that it's gone
        client.dropCollection(function(replies) {
          test.assertEquals(true, replies.ok);          
          finished_tests.push({test_collection_methods:'ok'});
        }, "test_collection_methods2")
      });
    });
  }, 'test_collection_methods')
}

// Test the authentication method for the user
function test_authentication() {
  var user_name = 'spongebob';
  var password = 'password';
  var user_password = MD5.hex_md5(user_name + ":mongo:" + password);
  
  client.authenticate('admin', 'admin', function(replies) {
    test.assertEquals(0, replies[0].documents[0].get('ok'));
    test.assertEquals("auth fails", replies[0].documents[0].get('errmsg'));
    // Fetch a user collection
    client.collection(function(user_collection) {
      // Insert a user document
      var user_doc = new OrderedHash().add('user', user_name).add('pwd', user_password);
      // Insert the user into the system users collections
      user_collection.insert(user_doc, function(documents) {
        test.assertTrue(documents[0].get('_id').toHexString().length == 24);
        // Ensure authentication works correctly
        client.authenticate(user_name, password, function(replies) {
          test.assertEquals(1, replies[0].documents[0].get('ok'));
          finished_tests.push({test_authentication:'ok'});
        });
      });      
    }, 'system.users');
  });
}

// Test the access to collections
function test_collections() {  
  // Create two collections
  client.createCollection(function(r) {
    client.createCollection(function(r) {
      // Insert test documents (creates collections)
      client.collection(function(spiderman_collection) {
        spiderman_collection.insert(new OrderedHash().add("foo", 5));        
      }, 'test.spiderman');
      
      client.collection(function(mario_collection) {
        mario_collection.insert(new OrderedHash().add("bar", 0));        
      }, 'test.mario');

      // Assert collections
      client.collections(function(collections) {
        test.assertTrue(locate_collection_by_name("test.spiderman", collections) != null);
        test.assertTrue(locate_collection_by_name("test.mario", collections) != null);
        test.assertTrue(locate_collection_by_name("does_not_exist", collections) == null);
        finished_tests.push({test_collections:'ok'});
      });
    }, 'test.mario');
  }, 'test.spiderman');  
}

// Test the generation of the object ids
function test_object_id_generation() {
  var number_of_tests_done = 0;

  client.collection(function(collection) {
    // Insert test documents (creates collections and test fetch by query)
    collection.insert(new OrderedHash().add("name", "Fred").add("age", 42), function(ids) {
      test.assertEquals(1, ids.length);    
      test.assertTrue(ids[0].get('_id').toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne(function(document) {
        test.assertEquals(ids[0].get('_id').toHexString(), document.get('_id').toHexString());
        number_of_tests_done++;
      }, new OrderedHash().add("name", "Fred"));      
    });

    // Insert another test document and collect using ObjectId
    collection.insert(new OrderedHash().add("name", "Pat").add("age", 21), function(ids) {
      test.assertEquals(1, ids.length);  
      test.assertTrue(ids[0].get('_id').toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne(function(document) {
        test.assertEquals(ids[0].get('_id').toHexString(), document.get('_id').toHexString());
        number_of_tests_done++;
      }, ids[0].get('_id'));      
    });
    
    // Manually created id
    var objectId = new ObjectID(null);
    
    // Insert a manually created document with generated oid
    collection.insert(new OrderedHash().add("_id", objectId).add("name", "Donald").add("age", 95), function(ids) {
      test.assertEquals(1, ids.length);  
      test.assertTrue(ids[0].get('_id').toHexString().length == 24);
      test.assertEquals(objectId.toHexString(), ids[0].get('_id').toHexString());
      // Locate the first document inserted
      collection.findOne(function(document) {
        test.assertEquals(ids[0].get('_id').toHexString(), document.get('_id').toHexString());
        test.assertEquals(objectId.toHexString(), document.get('_id').toHexString());
        number_of_tests_done++;
      }, ids[0].get('_id'));      
    });    
  }, 'test_object_id_generation.data');
    
  var intervalId = setInterval(function() {
    if(number_of_tests_done == 3) {
      clearInterval(intervalId);
      finished_tests.push({test_object_id_generation:'ok'});
    }
  }, 100);    
}

// Test the auto connect functionality of the db
function test_automatic_reconnect() {
  var automatic_connect_client = new Db('integration_tests_', [{host: "127.0.0.1", port: 27017, auto_reconnect: true}], {});
  automatic_connect_client.addListener("connect", function() {
    // Listener for closing event
    var closeListener = function(has_error) {
      // Remove the listener for the close to avoid loop
      automatic_connect_client.connections["127.0.0.127017"].connection.removeListener("close", this);
      // Let's insert a document
      automatic_connect_client.collection(function(collection) {
        // Insert another test document and collect using ObjectId
        collection.insert(new OrderedHash().add("name", "Patty").add("age", 34), function(ids) {
          test.assertEquals(1, ids.length);    
          test.assertTrue(ids[0].get('_id').toHexString().length == 24);

          collection.findOne(function(document) {
            test.assertEquals(ids[0].get('_id').toHexString(), document.get('_id').toHexString());
            // Let's close the db 
            finished_tests.push({test_automatic_reconnect:'ok'});    
            automatic_connect_client.close();
          }, new OrderedHash().add("name", "Patty"));      
        });        
      }, 'test_object_id_generation.data2');
    };    
    // Add listener to close event
    automatic_connect_client.connections["127.0.0.127017"].connection.addListener("close", closeListener);
    automatic_connect_client.connections["127.0.0.127017"].connection.close();
  });
  automatic_connect_client.open();  
}

// Test the error reporting functionality
function test_error_handling() {
  var error_client = new Db('integration_tests2_', [{host: "127.0.0.1", port: 27017, auto_reconnect: false}], {});
  error_client.addListener("connect", function() {
    error_client.resetErrorHistory(function() {
      error_client.error(function(documents) {
        test.assertEquals(true, documents[0].get('ok'));                
        test.assertEquals(0, documents[0].get('n'));    
                  
        // Force error on server
        error_client.executeDbCommand({forceerror: 1}, function(r) {
          test.assertEquals(0, r[0].documents[0].get('ok'));                
          test.assertEquals("db assertion failure", r[0].documents[0].get('errmsg'));    
          // // Check for previous errors
          error_client.previousErrors(function(documents) {
            test.assertEquals(true, documents[0].get('ok'));                
            test.assertEquals(1, documents[0].get('nPrev'));    
            test.assertEquals("forced error", documents[0].get('err'));
            // Check for the last error
            error_client.error(function(documents) {
              test.assertEquals("forced error", documents[0].get('err'));    
              // Force another error
              error_client.collection(function(collection) {
                collection.findOne(function(document) {              
                  // Check that we have two previous errors
                  error_client.previousErrors(function(documents) {
                    test.assertEquals(true, documents[0].get('ok'));                
                    test.assertEquals(2, documents[0].get('nPrev'));    
                    test.assertEquals("forced error", documents[0].get('err'));

                    error_client.resetErrorHistory(function() {
                      error_client.previousErrors(function(documents) {
                        test.assertEquals(true, documents[0].get('ok'));                
                        test.assertEquals(-1, documents[0].get('nPrev'));                        

                        error_client.error(function(documents) {
                          test.assertEquals(true, documents[0].get('ok'));                
                          test.assertEquals(0, documents[0].get('n'));                                              

                          // Let's close the db 
                          finished_tests.push({test_error_handling:'ok'}); 
                          error_client.close();
                        });
                      })
                    });
                  });
                }, new OrderedHash().add("name", "Fred"));                            
              }, 'test_error_collection');
            })          
          });
        });
      });
    });
  });
  
  error_client.open();
}

// Test the last status functionality of the driver
function test_last_status() {  
  client.createCollection(function(collection) {
    test.assertTrue(collection instanceof Collection);
    test.assertEquals('test_last_status', collection.collectionName);

    // Get the collection
    client.collection(function(collection) {
      // Remove all the elements of the collection
      collection.remove(function() {
        // Check update of a document
        collection.insert(new OrderedHash().add("i", 1), function(ids) {
          test.assertEquals(1, ids.length);    
          test.assertTrue(ids[0].get('_id').toHexString().length == 24);        

          // Update the record
          collection.update(function(result) {
            // Check for the last message from the server
            client.lastStatus(function(status) {
              test.assertEquals(true, status[0].documents[0].get('ok'));                
              test.assertEquals(true, status[0].documents[0].get('updatedExisting'));                
              // Check for failed update of document
              collection.update(function(result) {
                client.lastStatus(function(status) {
                  test.assertEquals(true, status[0].documents[0].get('ok'));                
                  test.assertEquals(false, status[0].documents[0].get('updatedExisting'));                

                  // Check safe update of a document
                  collection.insert(new OrderedHash().add("x", 1), function(ids) {
                    collection.update(function(document) {
                      test.assertTrue(document instanceof OrderedHash);
                      test.assertTrue(document.get('$set') instanceof OrderedHash);
                    }, new OrderedHash().add("x", 1), new OrderedHash().add("$set", new OrderedHash().add("x", 2)), {'safe':true});

                    collection.update(function(document) {
                      test.assertEquals(false, document.ok);    
                      test.assertEquals(true, document.err);    
                      test.assertEquals("Failed to update document", document.errmsg);

                      // Let's close the db 
                      finished_tests.push({last_status_client:'ok'});                     
                    }, new OrderedHash().add("y", 1), new OrderedHash().add("$set", new OrderedHash().add("y", 2)), {'safe':true});
                  });                
                });
              }, new OrderedHash().add("i", 1), new OrderedHash().add("$set", new OrderedHash().add("i", 500)));
            });
          }, new OrderedHash().add("i", 1), new OrderedHash().add("$set", new OrderedHash().add("i", 2)));
        });      
      });      
    }, 'test_last_status');  
  }, 'test_last_status');
}

// Test clearing out of the collection
function test_clear() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      collection.insert(new OrderedHash().add("i", 1), function(ids) {
        collection.insert(new OrderedHash().add("i", 2), function(ids) {
          collection.count(function(count) {
            test.assertEquals(2, count);    
            // Clear the collection
            collection.remove(function() {
              collection.count(function(count) {
                test.assertEquals(0, count);    
                // Let's close the db 
                finished_tests.push({test_clear:'ok'}); 
              });
            });        
          });
        });
      });          
    }, 'test_clear');    
  }, 'test_clear');  
}

// Test insert of documents
function test_insert() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      for(var i = 1; i < 1000; i++) {
        collection.insert(new OrderedHash().add('c', i), function(r) {});
      }

      collection.insert(new OrderedHash().add('a', 2), function(r) {
        collection.insert(new OrderedHash().add('a', 3), function(r) {
          collection.count(function(count) {
            test.assertEquals(1001, count);
            // Locate all the entries using find
            collection.find(function(cursor) {
              cursor.toArray(function(results) {
                test.assertEquals(1001, results.length);
                test.assertTrue(results[0] != null);

                // Let's close the db 
                finished_tests.push({test_insert:'ok'}); 
              });
            }, new OrderedHash());          
          });        
        });
      });      
    }, 'test_insert');    
  }, 'test_insert');
}

// Test multiple document insert
function test_multiple_insert() {
  client.createCollection(function(r) {
    var collection = client.collection(function(collection) {
      var docs = [new OrderedHash().add('a', 1), new OrderedHash().add('a', 2)];

      collection.insert(docs, function(ids) {
        ids.forEach(function(doc) {
          test.assertTrue(((doc.get('_id')) instanceof ObjectID));
        });

        // Let's ensure we have both documents
        collection.find(function(cursor) {
          cursor.toArray(function(docs) {
            test.assertEquals(2, docs.length);
            var results = [];
            // Check that we have all the results we want
            docs.forEach(function(doc) {
              if(doc.get('a') == 1 || doc.get('a') == 2) results.push(1);
            });
            test.assertEquals(2, results.length);
            // Let's close the db 
            finished_tests.push({test_multiple_insert:'ok'}); 
          });
        });
      });      
    }, 'test_multiple_insert');
  }, 'test_multiple_insert');  
}

// Test the count result on a collection that does not exist
function test_count_on_nonexisting() {
  client.collection(function(collection) {
    collection.count(function(count) {  
      test.assertEquals(0, count);
      // Let's close the db 
      finished_tests.push({test_count_on_nonexisting:'ok'}); 
    });    
  }, 'test_multiple_insert');
}

// Test a simple find
function test_find_simple() {
  client.createCollection(function(r) {
    var collection = client.collection(function(collection) {
      var doc1 = null;
      var doc2 = null;

      // Insert some test documents
      collection.insert([new OrderedHash().add('a', 2), new OrderedHash().add('b', 3)], function(docs) {doc1 = docs[0]; doc2 = docs[1]});
      // Ensure correct insertion testing via the cursor and the count function
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);
        })            
      });    
      collection.count(function(count) {
        test.assertEquals(2, count);      
      });
      // Fetch values by selection    
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(1, documents.length);
          test.assertEquals(doc1.get('a'), documents[0].get('a'));
          // Let's close the db 
          finished_tests.push({test_find_simple:'ok'}); 
        });
      }, {'a': doc1.get('a')});      
    }, 'test_find_simple');
  }, 'test_find_simple');
}

// Test advanced find
function test_find_advanced() {
  client.createCollection(function(r) {
    var collection = client.collection(function(collection) {
      var doc1 = null, doc2 = null, doc3 = null;

      // Insert some test documents
      collection.insert([new OrderedHash().add('a', 1), new OrderedHash().add('a', 2), new OrderedHash().add('b', 3)], function(docs) {doc1 = docs[0]; doc2 = docs[1]; doc3 = docs[2]});

      // Locate by less than
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);
          // Check that the correct documents are returned
          var results = [];
          // Check that we have all the results we want
          documents.forEach(function(doc) {
            if(doc.get('a') == 1 || doc.get('a') == 2) results.push(1);
          });
          test.assertEquals(2, results.length);
        });
      }, {'a':{'$lt':10}});    

      // Locate by greater than
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(1, documents.length);
          test.assertEquals(2, documents[0].get('a'));
        });
      }, {'a':{'$gt':1}});    

      // Locate by less than or equal to
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(1, documents.length);
          test.assertEquals(1, documents[0].get('a'));
        });
      }, {'a':{'$lte':1}});    

      // Locate by greater than or equal to
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);
          // Check that the correct documents are returned
          var results = [];
          // Check that we have all the results we want
          documents.forEach(function(doc) {
            if(doc.get('a') == 1 || doc.get('a') == 2) results.push(1);
          });
          test.assertEquals(2, results.length);
        });
      }, {'a':{'$gte':1}});    

      // Locate by between
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(1, documents.length);
          test.assertEquals(2, documents[0].get('a'));
        });
      }, {'a':{'$gt':1, '$lt':3}});    

      // Locate in clause
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);
          // Check that the correct documents are returned
          var results = [];
          // Check that we have all the results we want
          documents.forEach(function(doc) {
            if(doc.get('a') == 1 || doc.get('a') == 2) results.push(1);
          });
          test.assertEquals(2, results.length);
        });
      }, {'a':{'$in':[1,2]}});  

      // Locate regexp clause
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);
          // Check that the correct documents are returned
          var results = [];
          // Check that we have all the results we want
          documents.forEach(function(doc) {
            if(doc.get('a') == 1 || doc.get('a') == 2) results.push(1);
          });
          test.assertEquals(2, results.length);
          // Let's close the db 
          finished_tests.push({test_find_advanced:'ok'});     
        });
      }, {'a':/[1|2]/});                  
    }, 'test_find_advanced');
  }, 'test_find_advanced');
}

// Test sorting of results
function test_find_sorting() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      var doc1 = null, doc2 = null, doc3 = null, doc4 = null;

      // Insert some test documents
      collection.insert([new OrderedHash().add('a', 1).add('b', 2), 
          new OrderedHash().add('a', 2).add('b', 1), 
          new OrderedHash().add('a', 3).add('b', 2),
          new OrderedHash().add('a', 4).add('b', 1)
        ], function(docs) {doc1 = docs[0]; doc2 = docs[1]; doc3 = docs[2]; doc4 = docs[3]});

      // Test sorting (ascending)
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          test.assertEquals(1, documents[0].get('a'));
          test.assertEquals(2, documents[1].get('a'));
          test.assertEquals(3, documents[2].get('a'));
          test.assertEquals(4, documents[3].get('a'));
        });
      }, {'a': {'$lt':10}}, {'sort': [['a', 1]]});

      // Test sorting (descending)
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          test.assertEquals(4, documents[0].get('a'));
          test.assertEquals(3, documents[1].get('a'));
          test.assertEquals(2, documents[2].get('a'));
          test.assertEquals(1, documents[3].get('a'));
        });
      }, {'a': {'$lt':10}}, {'sort': [['a', -1]]});

      // Sorting using array of names, assumes ascending order
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          test.assertEquals(1, documents[0].get('a'));
          test.assertEquals(2, documents[1].get('a'));
          test.assertEquals(3, documents[2].get('a'));
          test.assertEquals(4, documents[3].get('a'));
        });
      }, {'a': {'$lt':10}}, {'sort': ['a']});

      // Sorting using single name, assumes ascending order
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          test.assertEquals(1, documents[0].get('a'));
          test.assertEquals(2, documents[1].get('a'));
          test.assertEquals(3, documents[2].get('a'));
          test.assertEquals(4, documents[3].get('a'));
        });
      }, {'a': {'$lt':10}}, {'sort': 'a'});

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          test.assertEquals(2, documents[0].get('a'));
          test.assertEquals(4, documents[1].get('a'));
          test.assertEquals(1, documents[2].get('a'));
          test.assertEquals(3, documents[3].get('a'));
        });
      }, {'a': {'$lt':10}}, {'sort': ['b', 'a']});

      // Sorting using empty array, no order guarantee should not blow up
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);
          // Let's close the db 
          finished_tests.push({test_find_sorting:'ok'});     
        });
      }, {'a': {'$lt':10}}, {'sort': []});

      // Sorting using ordered hash
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          // Fail test if not an error
          if(!(documents instanceof Error)) throw new TypeError("Should fail");
        });
      }, {'a': {'$lt':10}}, {'sort': new OrderedHash().add('a', -1)});            
    }, 'test_find_sorting');
  }, 'test_find_sorting');  
}

// Test the limit function of the db
function test_find_limits() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      var doc1 = null, doc2 = null, doc3 = null, doc4 = null;

      // Insert some test documents
      collection.insert([new OrderedHash().add('a', 1), 
          new OrderedHash().add('b', 2), 
          new OrderedHash().add('c', 3),
          new OrderedHash().add('d', 4)
        ], function(docs) {doc1 = docs[0]; doc2 = docs[1]; doc3 = docs[2]; doc4 = docs[3]});

      // Test limits
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(1, documents.length);        
        });
      }, {}, {'limit': 1});    

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(2, documents.length);        
        });
      }, {}, {'limit': 2});    

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(3, documents.length);        
        });
      }, {}, {'limit': 3});    

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);        
        });
      }, {}, {'limit': 4});    

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);        
        });
      }, {}, {});    

      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(4, documents.length);        
          // Let's close the db 
          finished_tests.push({test_find_limits:'ok'});     
        });
      }, {}, {'limit':99});          
    }, 'test_find_limits');
  }, 'test_find_limits');  
}

// Find no records
function test_find_one_no_records() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals(0, documents.length);        
          // Let's close the db 
          finished_tests.push({test_find_one_no_records:'ok'});     
        });
      }, {'a':1}, {});              
    }, 'test_find_one_no_records');
  }, 'test_find_one_no_records');  
}

// Test dropping of collections
function test_drop_collection() {
  client.createCollection(function(r) {
    client.dropCollection(function(r) {
      test.assertFalse(r.ok);
      test.assertTrue(r.err);
      test.assertEquals("ns not found", r.errmsg);
      var found = false;
      // Ensure we don't have the collection in the set of names
      client.collectionNames(function(replies) {
        replies.forEach(function(document) {
          if(document.name == "test_drop_collection") {
            found = true;
            break;
          }
        });        
        // Let's close the db 
        finished_tests.push({test_drop_collection:'ok'});     
        // If we have an instance of the index throw and error
        if(found) throw new Error("should not fail");
      });
    }, 'test_drop_collection');
  }, 'test_drop_collection2');
}

// Test dropping using the collection drop command
function test_other_drop() {
  client.createCollection(function(r) {
    client.collection(function(collection) {
      collection.drop(function(reply) {
        // Ensure we don't have the collection in the set of names
        client.collectionNames(function(replies) {
          var found = false;
          replies.forEach(function(document) {
            if(document.name == "test_other_drop") {
              found = true;
              break;
            }
          });        
          // Let's close the db 
          finished_tests.push({test_drop_collection:'ok'});     
          // If we have an instance of the index throw and error
          if(found) throw new Error("should not fail");
        });      
      });      
    }, 'test_other_drop');        
  }, 'test_other_drop');
}

function test_collection_names() {
  client.createCollection(function(r) {
    client.collectionNames(function(documents) {
      var found = false;
      var found2 = false;
      documents.forEach(function(document) {
        if(document.get('name') == 'integration_tests_.test_collection_names') found = true;
      });
      test.assertTrue(found);
      // Insert a document in an non-existing collection should create the collection
      client.collection(function(collection) {
        collection.insert({a:1})
        client.collectionNames(function(documents) {
          documents.forEach(function(document) {
            if(document.get('name') == 'integration_tests_.test_collection_names2') found = true;
            if(document.get('name') == 'integration_tests_.test_collection_names') found2 = true;
          });        

          test.assertTrue(found);      
          test.assertTrue(found2);      
        });
        // Let's close the db 
        finished_tests.push({test_collection_names:'ok'});             
      }, 'test_collection_names2');
    });    
  }, 'test_collection_names');
}

function test_collections_info() {
  client.createCollection(function(r) {
    client.collectionsInfo(function(cursor) {
      test.assertTrue((cursor instanceof Cursor));
      // Fetch all the collection info
      cursor.toArray(function(documents) {
        test.assertTrue(documents.length > 1);
        
        var found = false;
        documents.forEach(function(document) {
          if(document.get('name') == 'integration_tests_.test_collections_info') found = true;
        });
        test.assertTrue(found);
      });    
      // Let's close the db 
      finished_tests.push({test_collections_info:'ok'});         
    });
  }, 'test_collections_info');
}

function test_collection_options() {
  client.createCollection(function(collection) {    
    test.assertTrue(collection instanceof Collection);
    test.assertEquals('test_collection_options', collection.collectionName);
    // Let's fetch the collection options
    collection.options(function(options) {
      test.assertEquals(true, options.get('capped'));
      test.assertEquals(1024, options.get('size'));
      test.assertEquals("test_collection_options", options.get('create'));
      // Let's close the db 
      finished_tests.push({test_collection_options:'ok'});         
    });
  }, 'test_collection_options', {'capped':true, 'size':1024});
}

function test_index_information() {
  client.createCollection(function(collection) {    
    collection.insert({a:1}, function(ids) {
      // Create an index on the collection
      client.createIndex(function(indexName) {
        test.assertEquals("a_1", indexName);
        // Let's fetch the index information
        client.indexInformation(function(collectionInfo) {
          test.assertTrue(collectionInfo['_id_'] != null);
          test.assertEquals('_id', collectionInfo['_id_'][0][0]);
          test.assertTrue((collectionInfo['_id_'][0][1] instanceof ObjectID));
          test.assertTrue(collectionInfo['a_1'] != null);
          test.assertEquals([["a", 1]], collectionInfo['a_1']);
          
          client.indexInformation(function(collectionInfo2) {
            var count1 = 0, count2 = 0;
            // Get count of indexes
            for(var i in collectionInfo) { count1 += 1;}
            for(var i in collectionInfo2) { count2 += 1;}
            
            // Tests
            test.assertTrue(count2 >= count1);
            test.assertTrue(collectionInfo2['_id_'] != null);
            test.assertEquals('_id', collectionInfo2['_id_'][0][0]);
            test.assertTrue((collectionInfo2['_id_'][0][1] instanceof ObjectID));
            test.assertTrue(collectionInfo2['a_1'] != null);
            test.assertEquals([["a", 1]], collectionInfo2['a_1']);            
            test.assertTrue((collectionInfo[indexName] != null));
            test.assertEquals([["a", 1]], collectionInfo[indexName]);            
          
            // Let's close the db 
            finished_tests.push({test_index_information:'ok'});                 
          });          
        }, collection.collectionName);
      }, collection.collectionName, 'a');      
    })
  }, 'test_index_information');
}

function test_multiple_index_cols() {
  client.createCollection(function(collection) {    
    collection.insert({a:1}, function(ids) {
      // Create an index on the collection
      client.createIndex(function(indexName) {
        test.assertEquals("a_-1_b_1_c_-1", indexName);
        // Let's fetch the index information
        client.indexInformation(function(collectionInfo) {
          var count1 = 0;
          // Get count of indexes
          for(var i in collectionInfo) { count1 += 1;}          
          
          // Test
          test.assertEquals(2, count1);
          test.assertTrue(collectionInfo[indexName] != null);
          test.assertEquals([['a', -1], ['b', 1], ['c', -1]], collectionInfo[indexName]);
          
          // Let's close the db 
          finished_tests.push({test_multiple_index_cols:'ok'});                 
        }, collection.collectionName);        
      }, collection.collectionName, [['a', -1], ['b', 1], ['c', -1]]);
    });
  }, 'test_multiple_index_cols');
}

function test_unique_index() {
  // Create a non-unique index and test inserts
  client.createCollection(function(collection) {    
    client.createIndex(function(indexName) {
      // Insert some docs
      collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], function(ids) {
        // Assert that we have no erros
        client.error(function(errors) {
          test.assertEquals(1, errors.length);
          test.assertEquals(null, errors[0].get('err'));
          // Let's close the db 
          finished_tests.push({test_unique_index:'ok'});                 
        });
      });
    }, collection.collectionName, 'hello');        
  }, 'test_unique_index');
  
  // Create a unique index and test that insert fails
  client.createCollection(function(collection) {    
    client.createIndex(function(indexName) {
      // Insert some docs
      collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], function(ids) {
        // Assert that we have erros
        client.error(function(errors) {
          test.assertEquals(1, errors.length);
          test.assertTrue(errors[0].get('err') != null);
        });
      });
    }, collection.collectionName, 'hello', true);        
  }, 'test_unique_index2');  
}

function test_index_on_subfield() {
  // Create a non-unique index and test inserts
  client.createCollection(function(collection) {  
    collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], function(ids) {
      // Assert that we have no erros
      client.error(function(errors) {
        test.assertEquals(1, errors.length);
        test.assertTrue(errors[0].get('err') == null);
      });      
    });  
  }, 'test_index_on_subfield');
  
  // Create a unique subfield index and test that insert fails
  client.createCollection(function(collection) {  
    client.createIndex(function(indexName) {
      collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], function(ids) {
        // Assert that we have erros
        client.error(function(errors) {
          test.assertEquals(1, errors.length);
          test.assertTrue(errors[0].get('err') != null);
          // Let's close the db 
          finished_tests.push({test_index_on_subfield:'ok'});                 
        });
      });  
    }, collection.collectionName, 'hello.a', true);
  }, 'test_index_on_subfield2');  
}

function test_array() {
  // Create a non-unique index and test inserts
  client.createCollection(function(collection) {  
    collection.insert({'b':[1, 2, 3]}, function(ids) {
      collection.find(function(cursor) {
        cursor.toArray(function(documents) {
          test.assertEquals([1, 2, 3], documents[0].get('b'));
          // Let's close the db 
          finished_tests.push({test_array:'ok'});                 
        });
      }, {});
    });
  }, 'test_array');
}

function test_regex() {
  var regexp = /foobar/i;
  
  client.createCollection(function(collection) {  
    collection.insert({'b':regexp}, function(ids) {
      collection.find(function(cursor) {
        cursor.toArray(function(items) {
          test.assertEquals(("" + regexp), ("" + items[0].get('b')));
          // Let's close the db 
          finished_tests.push({test_regex:'ok'});                 
        });
      }, {}, {'fields': ['b']});
    });
  }, 'test_regex');
}

// Use some other id than the standard for inserts
function test_non_oid_id() {
  client.createCollection(function(collection) {  
    var date = new Date();
    date.setUTCDate(12);
    date.setUTCFullYear(2009);
    date.setUTCMonth(11 - 1);
    date.setUTCHours(12);
    date.setUTCMinutes(0);
    date.setUTCSeconds(30);
    
    collection.insert({'_id':date}, function(ids) {      
      collection.find(function(cursor) {
        cursor.toArray(function(items) {
          test.assertEquals(("" + date), ("" + items[0].get('_id')));
          
          // Let's close the db 
          finished_tests.push({test_non_oid_id:'ok'});                 
        });
      }, {'_id':date});      
    });    
  }, 'test_non_oid_id');
}

function test_strict_access_collection() {
  var error_client = new Db('integration_tests_', [{host: "127.0.0.1", port: 27017, auto_reconnect: false}], {strict:true});
  test.assertEquals(true, error_client.strict);
  error_client.addListener("connect", function() {
    error_client.collection(function(collection) {
      test.assertEquals(false, collection.ok);
      test.assertEquals(true, collection.err);
      test.assertEquals("Collection does-not-exist does not exist. Currently in strict mode.", collection.errmsg);      
    }, 'does-not-exist');
    
    error_client.createCollection(function(collection) {  
      error_client.collection(function(collection) {
        test.assertTrue(collection instanceof Collection);
        // Let's close the db 
        finished_tests.push({test_strict_access_collection:'ok'});                 
        error_client.close();
      }, 'test_strict_access_collection');
    }, 'test_strict_access_collection');
  });    
  error_client.open();
}

function test_strict_create_collection() {
  var error_client = new Db('integration_tests_', [{host: "127.0.0.1", port: 27017, auto_reconnect: false}], {strict:true});
  test.assertEquals(true, error_client.strict);
  error_client.addListener("connect", function() {
    error_client.createCollection(function(collection) {
      test.assertTrue(collection instanceof Collection);

      // Creating an existing collection should fail
      error_client.createCollection(function(collection) {
        test.assertEquals(false, collection.ok);
        test.assertEquals(true, collection.err);
        test.assertEquals("Collection test_strict_create_collection already exists. Currently in strict mode.", collection.errmsg);
        
        // Switch out of strict mode and try to re-create collection
        error_client.strict = false;
        error_client.createCollection(function(collection) {
          test.assertTrue(collection instanceof Collection);

          // Let's close the db 
          finished_tests.push({test_strict_create_collection:'ok'});                 
          error_client.close();
        }, 'test_strict_create_collection');                
      }, 'test_strict_create_collection');
    }, 'test_strict_create_collection');
  });
  error_client.open();  
}

function test_to_a() {
  client.createCollection(function(collection) {
    test.assertTrue(collection instanceof Collection);
    collection.insert({'a':1}, function(ids) {
      collection.find(function(cursor) {
        cursor.toArray(function(items) {
          // Should fail if called again (cursor should be closed)
          cursor.toArray(function(items) {
            test.assertEquals(false, items.ok);
            test.assertEquals(true, items.err);
            test.assertEquals("Cursor is closed", items.errmsg);

            // Each should also return an error due to the cursor being closed
            cursor.each(function(items) {
              test.assertEquals(false, items.ok);
              test.assertEquals(true, items.err);
              test.assertEquals("Cursor is closed", items.errmsg);              

              // Let's close the db 
              finished_tests.push({test_to_a:'ok'});                 
            });
          });
        });
      }, {});      
    });    
  }, 'test_to_a');
}

function test_to_a_after_each() {
  client.createCollection(function(collection) {
    test.assertTrue(collection instanceof Collection);
    collection.insert({'a':1}, function(ids) {
      collection.find(function(cursor) {
        cursor.each(function(item) {
          if(item == null) {
            cursor.toArray(function(items) {
              test.assertEquals(false, items.ok);
              test.assertEquals(true, items.err);
              test.assertEquals("Cursor is closed", items.errmsg);                            

              // Let's close the db 
              finished_tests.push({test_to_a_after_each:'ok'});                 
            });
          };
        });
      });
    });
  }, 'test_to_a_after_each');
}

function test_where() {
  client.createCollection(function(collection) {
    test.assertTrue(collection instanceof Collection);
    collection.insert([{'a':1}, {'a':2}, {'a':3}], function(ids) {
      collection.count(function(count) {
        test.assertEquals(3, count);
        
        // Let's test usage of the $where statement
        collection.find(function(cursor) {
          cursor.count(function(count) {
            test.assertEquals(1, count);
          });          
        }, {'$where':new Code('this.a > 2')});
        
        collection.find(function(cursor) {
          cursor.count(function(count) {
            test.assertEquals(2, count);

            // Let's close the db 
            finished_tests.push({test_where:'ok'});                 
          });
        }, {'$where':new Code('this.a > i', new OrderedHash().add('i', 1))});
      });
    });    
  }, 'test_where');
}

function test_eval() {
  client.eval(function(result) {
    test.assertEquals(3, result);
  }, 'function (x) {return x;}', [3]);
  
  client.eval(function(result) {
    test.assertEquals(null, result)        
    // Locate the entry
    client.collection(function(collection) {
      collection.findOne(function(item) {
        test.assertEquals(5, item.get('y'));
      });
    }, 'test_eval');    
  }, 'function (x) {db.test_eval.save({y:x});}', [5]);  
  
  client.eval(function(result) {
    test.assertEquals(5, result);    
  }, 'function (x, y) {return x + y;}', [2, 3]);
  
  client.eval(function(result) {
    test.assertEquals(5, result);    
  }, 'function () {return 5;}');
  
  client.eval(function(result) {
    test.assertEquals(5, result);        
  }, '2 + 3;');
  
  client.eval(function(result) {
    test.assertEquals(5, result);            
  }, new Code("2 + 3;"));
  
  client.eval(function(result) {
    test.assertEquals(2, result);            
  }, new Code("return i;", {'i':2}));
  
  client.eval(function(result) {
    test.assertEquals(5, result);            
  }, new Code("i + 3;", {'i':2}));
  
  client.eval(function(result) {
    test.assertEquals(false, result.ok);
    test.assertEquals(true, result.err);
    test.assertTrue(result.errmsg != null);
    // Let's close the db 
    finished_tests.push({test_eval:'ok'});                             
  }, "5 ++ 5;");
}

function test_hint() {
  client.createCollection(function(collection) {
    collection.insert({'a':1}, function(ids) {
      client.createIndex(function(indexName) {
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1}, {'hint':'a'});        
        
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1}, {'hint':['a']});        
        
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1}, {'hint':{'a':1}});      
        
        // Modify hints
        collection.setHint('a');
        test.assertEquals(1, collection.hint.get('a'));
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1});   
                
        collection.setHint(['a']);
        test.assertEquals(1, collection.hint.get('a'));
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1});   
             
        collection.setHint({'a':1});
        test.assertEquals(1, collection.hint.get('a'));
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
          });
        }, {'a':1});           
        
        collection.setHint(null);
        test.assertTrue(collection.hint == null);
        collection.find(function(cursor) {
          cursor.toArray(function(items) {
            test.assertEquals(1, items.length);
            // Let's close the db 
            finished_tests.push({test_hint:'ok'});                             
          });
        }, {'a':1});           
      }, collection.collectionName, "a");
    });
  }, 'test_hint');
}

function test_group() {
  client.createCollection(function(collection) {
    collection.group(function(results) {
      test.assertEquals([], results);
    }, [], {}, {"count":0}, "function (obj, prev) { prev.count++; }");
    
    collection.group(function(results) {
      test.assertEquals([], results);
      
      // Trigger some inserts
      collection.insert([{'a':2}, {'b':5}, {'a':1}], function(ids) {
        collection.group(function(results) {
          test.assertEquals(3, results[0].get('count'));
        }, [], {}, {"count":0}, "function (obj, prev) { prev.count++; }");        

        collection.group(function(results) {
          test.assertEquals(3, results[0].get('count'));
        }, [], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true);        

        collection.group(function(results) {
          test.assertEquals(1, results[0].get('count'));
        }, [], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }");        

        collection.group(function(results) {
          test.assertEquals(1, results[0].get('count'));

          // Insert some more test data
          collection.insert([{'a':2}, {'b':3}], function(ids) {
            collection.group(function(results) {
              test.assertEquals(2, results[0].get('a'));
              test.assertEquals(2, results[0].get('count'));
              test.assertEquals(null, results[1].get('a'));
              test.assertEquals(2, results[1].get('count'));
              test.assertEquals(1, results[2].get('a'));
              test.assertEquals(1, results[2].get('count'));
            }, ['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }");                                

            collection.group(function(results) {
              test.assertEquals(2, results[0].get('a'));
              test.assertEquals(2, results[0].get('count'));
              test.assertEquals(null, results[1].get('a'));
              test.assertEquals(2, results[1].get('count'));
              test.assertEquals(1, results[2].get('a'));
              test.assertEquals(1, results[2].get('count'));
            }, ['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true);                                
            
            collection.group(function(results) {
              test.assertEquals(false, results.ok);
              test.assertEquals(true, results.err);
              test.assertTrue(results.errmsg != null);
            }, [], {}, {}, "5 ++ 5");

            collection.group(function(results) {
              test.assertEquals(false, results.ok);
              test.assertEquals(true, results.err);
              test.assertTrue(results.errmsg != null);
              // Let's close the db 
              finished_tests.push({test_group:'ok'});                                   
            }, [], {}, {}, "5 ++ 5", true);
          });          
        }, [], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }", true);        
      });      
    }, [], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true);
  }, 'test_group');
}

function test_deref() {
  client.createCollection(function(collection) {
    collection.insert({'a':1}, function(ids) {
      collection.remove(function(result) {
        collection.count(function(count) {
          test.assertEquals(0, count);          
          
          // Execute deref a db reference
          client.dereference(function(result) {
            collection.insert({'x':'hello'}, function(ids) {
              collection.findOne(function(document) {
                test.assertEquals('hello', document.get('x'));
                
                client.dereference(function(result) {
                  test.assertEquals('hello', document.get('x'));
                }, new DBRef("test_deref", document.get('_id')));
              });
            });            
          }, new DBRef("test_deref", new ObjectID()));
          
          client.dereference(function(result) {
            var obj = {'_id':4};
            
            collection.insert(obj, function(ids) {
              client.dereference(function(document) {
                test.assertEquals(obj['_id'], document.get('_id'));
                
                collection.remove(function(result) {
                  collection.insert({'x':'hello'}, function(ids) {
                    client.dereference(function(result) {
                      test.assertEquals(null, result);
                      // Let's close the db 
                      finished_tests.push({test_deref:'ok'});                                   
                    }, new DBRef("test_deref", null));
                  });
                });
              }, new DBRef("test_deref", 4));
            });
          }, new DBRef("test_deref", 4));          
        })
      })          
    })    
  }, 'test_deref');
}

function test_save() {
  client.createCollection(function(collection) {
    var doc = {'hello':'world'};
    collection.save(function(docs) {
      test.assertTrue(docs[0].get('_id') instanceof ObjectID);
      collection.count(function(count) {
        test.assertEquals(1, count);
        doc = docs[0];
        
        collection.save(function(doc) {
          collection.count(function(count) {
            test.assertEquals(1, count);                        
          });
          
          collection.findOne(function(doc) {
            test.assertEquals('world', doc.get('hello'));
            
            // Modify doc and save
            doc = doc.add('hello', 'mike');
            // sys.puts("length:" + doc.length());
            collection.save(function(doc) {
              collection.count(function(count) {
                test.assertEquals(1, count);                        
              });
              
              collection.findOne(function(doc) {
                test.assertEquals('mike', doc.get('hello'));
                
                // Save another document
                collection.save(function(doc) {
                  collection.count(function(count) {
                    test.assertEquals(2, count);                        
                    // Let's close the db 
                    finished_tests.push({test_save:'ok'});                                   
                  });                  
                }, new OrderedHash().add('hello', 'world'));                
              });              
            }, doc);            
          });
        }, doc);        
      });
    }, doc);
  }, 'test_save');
}

function test_save_long() {
  client.createCollection(function(collection) {
    collection.insert({'x':Long.fromNumber(9223372036854775807)});
    collection.findOne(function(doc) {
      test.assertTrue(Long.fromNumber(9223372036854775807).equals(doc.get('x')));
      // Let's close the db 
      finished_tests.push({test_save_long:'ok'});                                   
    });
  }, 'test_save_long');
}

function test_find_by_oid() {
  client.createCollection(function(collection) {
    collection.save(function(docs) {
      test.assertTrue(docs[0].get('_id') instanceof ObjectID);
      
      collection.findOne(function(doc) {
        test.assertEquals('mike', doc.get('hello'));
        
        var id = doc.get('_id').toString();
        collection.findOne(function(doc) {
          test.assertEquals('mike', doc.get('hello'));          
          // Let's close the db 
          finished_tests.push({test_find_by_oid:'ok'});                                   
        }, {'_id':new ObjectID(id)});        
      }, {'_id':docs[0].get('_id')});      
    }, {'hello':'mike'});    
  }, 'test_find_by_oid');
}

function test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection() {
  client.createCollection(function(collection) {
    var a = {'_id':'1', 'hello':'world'};
    collection.save(function(docs) {
      collection.count(function(count) {
        test.assertEquals(1, count);
        
        collection.findOne(function(doc) {
          test.assertEquals('world', doc.get('hello'));
          
          doc.add('hello', 'mike');
          collection.save(function(doc) {
            collection.count(function(count) {
              test.assertEquals(1, count);
            });
            
            collection.findOne(function(doc) {
              test.assertEquals('mike', doc.get('hello'));
              // Let's close the db 
              finished_tests.push({test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection:'ok'});                                   
            });
          }, doc);          
        });        
      });
    }, a);
    
  }, 'test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection');
}

function test_invalid_key_names() {
  client.createCollection(function(collection) {
    // Legal inserts
    collection.insert([{'hello':'world'}, {'hello':{'hello':'world'}}]);
    // Illegal insert for key
    collection.insert({'$hello':'world'}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key $hello must not start with '$'", doc.errmsg);            
    });
    
    collection.insert({'hello':{'$hello':'world'}}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key $hello must not start with '$'", doc.errmsg);              
    });
    
    collection.insert({'he$llo':'world'}, function(docs) {
      test.assertTrue(docs[0] instanceof OrderedHash);
    })

    collection.insert({'hello':{'hell$o':'world'}}, function(docs) {
      test.assertTrue(docs[0] instanceof OrderedHash);
    })

    collection.insert({'.hello':'world'}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key .hello must not contain '.'", doc.errmsg);            
    });

    collection.insert({'hello':{'.hello':'world'}}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key .hello must not contain '.'", doc.errmsg);            
    });

    collection.insert({'hello.':'world'}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key hello. must not contain '.'", doc.errmsg);            
    });

    collection.insert({'hello':{'hello.':'world'}}, function(doc) {
      test.assertEquals(true, doc.err);
      test.assertEquals(false, doc.ok);
      test.assertEquals("Error: key hello. must not contain '.'", doc.errmsg);            
      // Let's close the db 
      finished_tests.push({test_invalid_key_names:'ok'});                                   
    });    
  }, 'test_invalid_key_names');
}

function test_collection_names() {
  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection name must be a String", collection.errmsg);            
  }, 5);
  
  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection names cannot be empty", collection.errmsg);            
  }, "");  

  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection names must not contain '$'", collection.errmsg);            
  }, "te$t");  

  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection names must not start or end with '.'", collection.errmsg);            
  }, ".test");  

  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection names must not start or end with '.'", collection.errmsg);            
  }, "test.");  

  client.collection(function(collection) {
    test.assertEquals(true, collection.err);
    test.assertEquals(false, collection.ok);
    test.assertEquals("Error: collection names cannot be empty", collection.errmsg);            
    
    // Let's close the db 
    finished_tests.push({test_collection_names:'ok'});                                   
  }, "test..t");  
}

function test_rename_collection() {
  client.createCollection(function(collection) {
    client.createCollection(function(collection) {

      client.collection(function(collection1) {
        client.collection(function(collection2) {
          // Assert rename
          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection name must be a String", collection.errmsg);            
          }, 5);

          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection names cannot be empty", collection.errmsg);            
          }, "");

          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection names must not contain '$'", collection.errmsg);            
          }, "te$t");

          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection names must not start or end with '.'", collection.errmsg);            
          }, ".test");

          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection names must not start or end with '.'", collection.errmsg);            
          }, "test.");

          collection1.rename(function(collection) {
            test.assertEquals(true, collection.err);
            test.assertEquals(false, collection.ok);
            test.assertEquals("Error: collection names cannot be empty", collection.errmsg);            
          }, "tes..t");
          
          collection1.count(function(count) {
            test.assertEquals(0, count);

            collection1.insert([{'x':1}, {'x':2}], function(docs) {
              collection1.count(function(count) {
                test.assertEquals(2, count);                
                
                collection1.rename(function(collection) {
                  test.assertEquals(true, collection.err);
                  test.assertEquals(false, collection.ok);
                  test.assertEquals("db assertion failure", collection.errmsg);            
                  
                  collection1.rename(function(collection) {
                    test.assertEquals("test_rename_collection3", collection.collectionName);
                    
                    // Check count
                    collection.count(function(count) {
                      test.assertEquals(2, count);                                      
                      // Let's close the db 
                      finished_tests.push({test_rename_collection:'ok'});                                   
                    });                    
                  }, 'test_rename_collection3');                  
                }, 'test_rename_collection2');                
              });
            })            
          })

          collection2.count(function(count) {
            test.assertEquals(0, count);
          })

        }, 'test_rename_collection2');        
      }, 'test_rename_collection');
      
    }, 'test_rename_collection2');    
  }, 'test_rename_collection');
}

var client_tests = [test_rename_collection];

var client_tests = [test_collection_methods, test_authentication, test_collections, test_object_id_generation,
      test_automatic_reconnect, test_error_handling, test_last_status, test_clear, test_insert,
      test_multiple_insert, test_count_on_nonexisting, test_find_simple, test_find_advanced,
      test_find_sorting, test_find_limits, test_find_one_no_records, test_drop_collection, test_other_drop, 
      test_collection_names, test_collections_info, test_collection_options, test_index_information, 
      test_multiple_index_cols, test_unique_index, test_index_on_subfield, test_array, test_regex,
      test_non_oid_id, test_strict_access_collection, test_strict_create_collection, test_to_a,
      test_to_a_after_each, test_where, test_eval, test_hint, test_group, test_deref, test_save,
      test_save_long, test_find_by_oid, test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection,
      test_invalid_key_names, test_collection_names, test_rename_collection];

/*******************************************************************************************************
  Setup For Running Tests
*******************************************************************************************************/
// Set up the client connection
var client = new Db('integration_tests_', [{host: "127.0.0.1", port: 27017}], {});
client.addListener("connect", function() {
  // Do cleanup of the db
  client.dropDatabase(function() {
    // Run all the tests
    run_all_tests();  
    // Start the timer that checks that all the tests have finished or failed
    ensure_tests_finished();  
  });
});
client.open();

function ensure_tests_finished() {
  var intervalId = setInterval(function() {
    if(finished_tests.length >= client_tests.length) {
      // Print out the result
      sys.puts("= Results =========================================================");
      // Stop interval timer and close db connection
      clearInterval(intervalId);
      client.close();
      // Print all the statuses
      finished_tests.forEach(function(t) {
        for(var i in t) {
          sys.puts(i + " = " + sys.inspect(t[i]));
        }
      });
    }
  }, 100);
};

// All the finished client tests
var finished_tests = [];
// Run all the tests
function run_all_tests() {
  // client_tests = client_tests.sort(randOrd);
  // Run all the tests
  client_tests.forEach(function (t) {    
    var function_name = t.name;
    sys.puts("executing test: [" + function_name + "]"); 
    try {
      t();      
    } catch(error) {
      sys.puts(sys.inspect(error));
      finished_tests.push({function_name:error});
    }
  });
}

function randOrd() {
  return (Math.round(Math.random()) - 0.5); 
}

/**
  Helper Utilities for the testing
**/
function locate_collection_by_name(collectionName, collections) {
  var foundObject = null;
  collections.forEach(function(collection) {
    if(collection.collectionName == collectionName) foundObject = collection;
  });
  return foundObject;
}