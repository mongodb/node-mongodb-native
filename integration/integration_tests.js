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
  client.createCollection(function(replies) {
    // Verify that all the result are correct coming back (should contain the value ok)
    test.assertEquals(1, replies[0].documents[0].ok);
    // Let's check that the collection was created correctly
    client.collectionNames(function(documents) {
      var found = false;
      documents.forEach(function(document) {
        if(document.name == "integration_tests_.test_collection_methods") found = true;
      });      
      test.assertTrue(true, found);
      // Rename the collection and check that it's gone
      client.renameCollection("test_collection_methods", "test_collection_methods2", function(replies) {
        test.assertEquals(1, replies[0].documents[0].ok);
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
    test.assertEquals(0, replies[0].documents[0].ok);
    test.assertEquals("auth fails", replies[0].documents[0].errmsg);
    // Fetch a user collection
    var user_collection = client.collection('system.users');
    // Insert a user document
    var user_doc = new OrderedHash().add('user', user_name).add('pwd', user_password);
    // Insert the user into the system users collections
    user_collection.insert(user_doc, function(documents) {
      test.assertTrue(documents[0]['_id'].toHexString().length == 24);
      // Ensure authentication works correctly
      client.authenticate(user_name, password, function(replies) {
        test.assertEquals(1, replies[0].documents[0].ok);
        finished_tests.push({test_authentication:'ok'});
      });
    });
  });
}

// Test the access to collections
function test_collections() {  
  // Create two collections
  client.createCollection(function(r) {
    client.createCollection(function(r) {
      var spiderman_collection = client.collection('test.spiderman');
      var mario_collection = client.collection('test.mario');
      // Insert test documents (creates collections)
      spiderman_collection.insert(new OrderedHash().add("foo", 5));
      mario_collection.insert(new OrderedHash().add("bar", 0));
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
  var collection = client.collection('test_object_id_generation.data');
  var number_of_tests_done = 0;

  // Insert test documents (creates collections and test fetch by query)
  collection.insert(new OrderedHash().add("name", "Fred").add("age", 42), function(ids) {
    test.assertEquals(1, ids.length);    
    test.assertTrue(ids[0]['_id'].toHexString().length == 24);
    // Locate the first document inserted
    collection.findOne(new OrderedHash().add("name", "Fred"), function(records) {
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
      number_of_tests_done++;
    });      
  });

  // // Insert another test document and collect using ObjectId
  collection.insert(new OrderedHash().add("name", "Pat").add("age", 21), function(ids) {
    test.assertEquals(1, ids.length);  
    test.assertTrue(ids[0]['_id'].toHexString().length == 24);
    // Locate the first document inserted
    collection.findOne(ids[0]['_id'], function(records) {
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
      number_of_tests_done++;
    });      
  });
  
  // Manually created id
  var objectId = new ObjectID(null);
  
  // Insert a manually created document with generated oid
  collection.insert(new OrderedHash().add("_id", objectId.id).add("name", "Donald").add("age", 95), function(ids) {
    test.assertEquals(1, ids.length);  
    test.assertTrue(ids[0]['_id'].toHexString().length == 24);
    test.assertEquals(objectId.toHexString(), ids[0]['_id'].toHexString());
    // Locate the first document inserted
    collection.findOne(ids[0]['_id'], function(records) {
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
      test.assertEquals(objectId.toHexString(), records[0].documents[0]['_id'].toHexString());
      number_of_tests_done++;
    });      
  });
    
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
      var collection = automatic_connect_client.collection('test_object_id_generation.data2');
      // Insert another test document and collect using ObjectId
      collection.insert(new OrderedHash().add("name", "Patty").add("age", 34), function(ids) {
        test.assertEquals(1, ids.length);    
        test.assertTrue(ids[0]['_id'].toHexString().length == 24);
                    
        collection.findOne(new OrderedHash().add("name", "Patty"), function(records) {
          test.assertEquals(1, records.length);          
          test.assertEquals(1, records[0].documents.length);    
          test.assertEquals(ids[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
          // Let's close the db 
          finished_tests.push({test_automatic_reconnect:'ok'});    
          automatic_connect_client.close();
        });      
      });
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
      error_client.error(function(r) {
        test.assertEquals(true, r[0].documents[0].ok);                
        test.assertEquals(0, r[0].documents[0].n);    
                  
        // Force error on server
        error_client.executeDbCommand({forceerror: 1}, function(r) {
          test.assertEquals(0, r[0].documents[0].ok);                
          test.assertEquals("db assertion failure", r[0].documents[0].errmsg);    
          // Check for previous errors
          error_client.previousErrors(function(r) {
            test.assertEquals(true, r[0].documents[0].ok);                
            test.assertEquals(1, r[0].documents[0].nPrev);    
            test.assertEquals("forced error", r[0].documents[0].err);
            // Check for the last error
            error_client.error(function(r) {
              test.assertEquals("forced error", r[0].documents[0].err);    
              // Force another error
              var collection = error_client.collection('test_error_collection');
              collection.findOne(new OrderedHash().add("name", "Fred"), function(records) {              
                // Check that we have two previous errors
                error_client.previousErrors(function(r) {
                  test.assertEquals(true, r[0].documents[0].ok);                
                  test.assertEquals(2, r[0].documents[0].nPrev);    
                  test.assertEquals("forced error", r[0].documents[0].err);
                
                  error_client.resetErrorHistory(function() {
                    error_client.previousErrors(function(r) {
                      test.assertEquals(true, r[0].documents[0].ok);                
                      test.assertEquals(-1, r[0].documents[0].nPrev);                        

                      error_client.error(function(r) {
                        test.assertEquals(true, r[0].documents[0].ok);                
                        test.assertEquals(0, r[0].documents[0].n);                                              

                        // Let's close the db 
                        finished_tests.push({test_error_handling:'ok'}); 
                        error_client.close();
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
  
  error_client.open();
}

// Test the last status functionality of the driver
function test_last_status() {  
  client.createCollection(function(r) {
    test.assertEquals(true, r[0].documents[0].ok);                            

    // Get the collection
    var collection = client.collection('test_last_status');
  
    // Remove all the elements of the collection
    collection.remove(function() {
      // Check update of a document
      collection.insert(new OrderedHash().add("i", 1), function(ids) {
        test.assertEquals(1, ids.length);    
        test.assertTrue(ids[0]['_id'].toHexString().length == 24);        
        
        // Update the record
        collection.update(function(result) {
          // Check for the last message from the server
          client.lastStatus(function(status) {
            test.assertEquals(true, status[0].documents[0].ok);                
            test.assertEquals(true, status[0].documents[0].updatedExisting);                
            // Check for failed update of document
            collection.update(function(result) {
              client.lastStatus(function(status) {
                test.assertEquals(true, status[0].documents[0].ok);                
                test.assertEquals(false, status[0].documents[0].updatedExisting);                
                
                // Check safe update of a document
                collection.insert(new OrderedHash().add("x", 1), function(ids) {
                  collection.update(function(status) {
                    test.assertEquals(false, status.err);    
                    test.assertEquals(true, status.ok);    
                    
                    // Let's close the db 
                    finished_tests.push({last_status_client:'ok'});                     
                  }, new OrderedHash().add("x", 1), new OrderedHash().add("$set", new OrderedHash().add("x", 2)), {safe:true});
                });                
              });
            }, new OrderedHash().add("i", 1), new OrderedHash().add("$set", new OrderedHash().add("i", 500)));
          });
        }, new OrderedHash().add("i", 1), new OrderedHash().add("$set", new OrderedHash().add("i", 2)));
      });      
    });
  }, 'test_last_status');
}

// Test clearing out of the collection
function test_clear() {
  client.createCollection(function(r) {
    var collection = client.collection('test_clear');
    
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
}

// Test insert of documents
function test_insert() {
  client.createCollection(function(r) {
    var collection = client.collection('test_insert');
    
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
}

// Test multiple document insert
function test_multiple_insert() {
  client.createCollection(function(r) {
    var collection = client.collection('test_multiple_insert');
    var docs = [new OrderedHash().add('a', 1), new OrderedHash().add('a', 2)];

    collection.insert(docs, function(ids) {
      ids.forEach(function(doc) {
        test.assertTrue((doc['_id'] instanceof ObjectID));
      });
      
      // Let's ensure we have both documents
      collection.find(function(cursor) {
        cursor.toArray(function(docs) {
          test.assertEquals(2, docs.length);
          var results = [];
          // Check that we have all the results we want
          docs.forEach(function(doc) {
            if(doc['a'] == 1 || doc['a'] == 2) results.push(1);
          });
          test.assertEquals(2, results.length);
          // Let's close the db 
          finished_tests.push({test_multiple_insert:'ok'}); 
        });
      });
    });
  }, 'test_multiple_insert');  
}

// Test the count result on a collection that does not exist
function test_count_on_nonexisting() {
  var collection = client.collection('test_multiple_insert');
  collection.count(function(count) {  
    test.assertEquals(0, count);
    // Let's close the db 
    finished_tests.push({test_count_on_nonexisting:'ok'}); 
  });
}

// Test a simple find
function test_find_simple() {
  client.createCollection(function(r) {
    var collection = client.collection('test_find_simple');
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
        test.assertEquals(doc1['a'], documents[0]['a']);
        // Let's close the db 
        finished_tests.push({test_find_simple:'ok'}); 
      });
    }, {'a': doc1['a']});
  }, 'test_find_simple');
}

// Test advanced find
function test_find_advanced() {
  client.createCollection(function(r) {
    var collection = client.collection('test_find_advanced');
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
          if(doc['a'] == 1 || doc['a'] == 2) results.push(1);
        });
        test.assertEquals(2, results.length);
      });
    }, {'a':{'$lt':10}});    
    
    // Locate by greater than
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(1, documents.length);
        test.assertEquals(2, documents[0]['a']);
      });
    }, {'a':{'$gt':1}});    
    
    // Locate by less than or equal to
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(1, documents.length);
        test.assertEquals(1, documents[0]['a']);
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
          if(doc['a'] == 1 || doc['a'] == 2) results.push(1);
        });
        test.assertEquals(2, results.length);
      });
    }, {'a':{'$gte':1}});    
    
    // Locate by between
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(1, documents.length);
        test.assertEquals(2, documents[0]['a']);
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
          if(doc['a'] == 1 || doc['a'] == 2) results.push(1);
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
          if(doc['a'] == 1 || doc['a'] == 2) results.push(1);
        });
        test.assertEquals(2, results.length);
        // Let's close the db 
        finished_tests.push({test_find_advanced:'ok'});     
      });
    }, {'a':/[1|2]/});            
  }, 'test_find_advanced');
}

// Test sorting of results
function test_find_sorting() {
  client.createCollection(function(r) {
    var collection = client.collection('test_find_sorting');
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
        test.assertEquals(1, documents[0]['a']);
        test.assertEquals(2, documents[1]['a']);
        test.assertEquals(3, documents[2]['a']);
        test.assertEquals(4, documents[3]['a']);
      });
    }, {'a': {'$lt':10}}, {'sort': [['a', 1]]});
    
    // Test sorting (descending)
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(4, documents.length);
        test.assertEquals(4, documents[0]['a']);
        test.assertEquals(3, documents[1]['a']);
        test.assertEquals(2, documents[2]['a']);
        test.assertEquals(1, documents[3]['a']);
      });
    }, {'a': {'$lt':10}}, {'sort': [['a', -1]]});
    
    // Sorting using array of names, assumes ascending order
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(4, documents.length);
        test.assertEquals(1, documents[0]['a']);
        test.assertEquals(2, documents[1]['a']);
        test.assertEquals(3, documents[2]['a']);
        test.assertEquals(4, documents[3]['a']);
      });
    }, {'a': {'$lt':10}}, {'sort': ['a']});
    
    // Sorting using single name, assumes ascending order
    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(4, documents.length);
        test.assertEquals(1, documents[0]['a']);
        test.assertEquals(2, documents[1]['a']);
        test.assertEquals(3, documents[2]['a']);
        test.assertEquals(4, documents[3]['a']);
      });
    }, {'a': {'$lt':10}}, {'sort': 'a'});

    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(4, documents.length);
        test.assertEquals(2, documents[0]['a']);
        test.assertEquals(4, documents[1]['a']);
        test.assertEquals(1, documents[2]['a']);
        test.assertEquals(3, documents[3]['a']);
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
}

// Test the limit function of the db
function test_find_limits() {
  client.createCollection(function(r) {
    var collection = client.collection('test_find_limits');
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
}

// Find no records
function test_find_one_no_records() {
  client.createCollection(function(r) {
    var collection = client.collection('test_find_one_no_records');

    collection.find(function(cursor) {
      cursor.toArray(function(documents) {
        test.assertEquals(0, documents.length);        
        // Let's close the db 
        finished_tests.push({test_find_one_no_records:'ok'});     
      });
    }, {'a':1}, {});        
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
    var collection = client.collection('test_other_drop');    
    
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
}

function test_collection_names() {
  client.createCollection(function(r) {
    client.collectionNames(function(documents) {
      var found = false;
      var found2 = false;
      documents.forEach(function(document) {
        if(document.name == 'integration_tests_.test_collection_names') found = true;
      });
      test.assertTrue(found);
      // Insert a document in an non-existing collection should create the collection
      var collection = client.collection('test_collection_names2');
      collection.insert({a:1})
      client.collectionNames(function(documents) {
        documents.forEach(function(document) {
          if(document.name == 'integration_tests_.test_collection_names2') found = true;
          if(document.name == 'integration_tests_.test_collection_names') found2 = true;
        });        

        test.assertTrue(found);      
        test.assertTrue(found2);      
      });
      // Let's close the db 
      finished_tests.push({test_collection_names:'ok'});     
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
          if(document.name == 'integration_tests_.test_collections_info') found = true;
        });
        test.assertTrue(found);
      });    
      // Let's close the db 
      finished_tests.push({test_collections_info:'ok'});         
    });
  }, 'test_collections_info');
}


// var client_tests = [test_collection_methods, test_object_id_generation, test_collections];
// var client_tests = [test_collections, test_collection_methods];

var client_tests = [test_collection_methods, test_authentication, test_collections, test_object_id_generation,
      test_automatic_reconnect, test_error_handling, test_last_status, test_clear, test_insert,
      test_multiple_insert, test_count_on_nonexisting, test_find_simple, test_find_advanced,
      test_find_sorting, test_find_limits, test_find_one_no_records, test_drop_collection, test_other_drop, 
      test_collection_names, test_collections_info];

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