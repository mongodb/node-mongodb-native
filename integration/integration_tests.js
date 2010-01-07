require.paths.unshift("./lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");
require("mongodb/db");

/*******************************************************************************************************
  Integration Tests
*******************************************************************************************************/

// Test the creation of a collection on the mongo db
function test_collection_methods() {
  client.createCollection('integration_test_collection', function(replies) {
    // Verify that all the result are correct coming back (should contain the value ok)
    test.assertEquals(1, replies[0].documents[0].ok);
    // Let's check that the collection was created correctly
    client.collection_names(null, function(replies) {
      test.assertEquals("integration_tests_.integration_test_collection", replies[0].documents[0].name);
      // Rename the collection and check that it's gone
      client.renameCollection("integration_test_collection", "integration_test_collection2", function(replies) {
        test.assertEquals(1, replies[0].documents[0].ok);
        // Drop the collection and check that it's gone
        client.dropCollection("integration_test_collection2", function(replies) {
          test.assertEquals(1, replies[0].documents[0].ok);          
          finished_tests.push({test_collection_methods:'ok'});
        })
      });
    });
  })
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
    user_collection.insert(user_doc, function(replies) {
      test.assertTrue(replies[0].documents[0]['_id'].toHexString().length == 24);
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
  var spiderman_collection = client.collection('test.spiderman');
  var mario_collection = client.collection('test.mario');
  // Insert test documents (creates collections)
  spiderman_collection.insert(new OrderedHash().add("foo", 5));
  mario_collection.insert(new OrderedHash().add("bar", 0));
  // Assert collections
  client.collections(function(collections) {
    test.assertTrue(collections.length >= 2);
    test.assertTrue(locate_collection_by_name("test.spiderman", collections) != null);
    test.assertTrue(locate_collection_by_name("test.mario", collections) != null);
    test.assertTrue(locate_collection_by_name("does_not_exist", collections) == null);
    finished_tests.push({test_collections:'ok'});
  });
}

// Test the generation of the object ids
function test_object_id_generation() {
  var collection = client.collection('test_object_id_generation.data');
  var number_of_tests_done = 0;

  // Insert test documents (creates collections and test fetch by query)
  collection.insert(new OrderedHash().add("name", "Fred").add("age", 42), function(ids) {
    test.assertEquals(1, ids.length);    
    test.assertEquals(1, ids[0].documents.length);  
    test.assertTrue(ids[0].documents[0]['_id'].toHexString().length == 24);
    // Locate the first document inserted
    collection.findOne(new OrderedHash().add("name", "Fred"), function(records) {
      test.assertEquals(1, records.length);          
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0].documents[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
      number_of_tests_done++;
    });      
  });

  // Insert another test document and collect using ObjectId
  collection.insert(new OrderedHash().add("name", "Pat").add("age", 21), function(ids) {
    test.assertEquals(1, ids.length);    
    test.assertEquals(1, ids[0].documents.length);  
    test.assertTrue(ids[0].documents[0]['_id'].toHexString().length == 24);
    // Locate the first document inserted
    collection.findOne(ids[0].documents[0]['_id'], function(records) {
      test.assertEquals(1, records.length);          
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0].documents[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
      number_of_tests_done++;
    });      
  });
  
  // Manually created id
  var objectId = new ObjectID(null);
  
  // Insert a manually created document with generated oid
  collection.insert(new OrderedHash().add("_id", objectId.id).add("name", "Donald").add("age", 95), function(ids) {
    test.assertEquals(1, ids.length);    
    test.assertEquals(1, ids[0].documents.length);  
    test.assertTrue(ids[0].documents[0]['_id'].toHexString().length == 24);
    test.assertEquals(objectId.toHexString(), ids[0].documents[0]['_id'].toHexString());
    // Locate the first document inserted
    collection.findOne(ids[0].documents[0]['_id'], function(records) {
      test.assertEquals(1, records.length);          
      test.assertEquals(1, records[0].documents.length);    
      test.assertEquals(ids[0].documents[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
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
        test.assertEquals(1, ids[0].documents.length);  
        test.assertTrue(ids[0].documents[0]['_id'].toHexString().length == 24);
                    
        collection.findOne(new OrderedHash().add("name", "Patty"), function(records) {
          test.assertEquals(1, records.length);          
          test.assertEquals(1, records[0].documents.length);    
          test.assertEquals(ids[0].documents[0]['_id'].toHexString(), records[0].documents[0]['_id'].toHexString());
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

// All the client tests
var client_tests = [test_collection_methods, test_authentication, test_collections, test_object_id_generation, test_automatic_reconnect];
// var client_tests = [test_collection_methods, test_authentication, test_collections, test_object_id_generation];
// var client_tests = [test_automatic_reconnect];
var finished_tests = [];
// Run all the tests
function run_all_tests() {
  sys.puts("= Executing tests =====================================================");
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

/**
  Helper Utilities for the testing
**/
function locate_collection_by_name(collectionName, collections) {
  for(var index in collections) {
    var collection = collections[index];
    if(collection.collectionName == collectionName) return collection;
  }
}