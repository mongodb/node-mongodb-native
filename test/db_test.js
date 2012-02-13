var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  DBRef = require('../lib/mongodb/bson/db_ref').DBRef,
  Code = require('../lib/mongodb/bson/code').Code,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var native_parser = (process.env['TEST_NATIVE'] != null);
var client = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleIllegalDbNames = function(test) {
  // Assert rename
  try {
    new Db(5);         
  } catch(err) {
    test.ok(err instanceof Error);
    test.equal("database name must be a string", err.message);
  }

  try {
    new Db("");
  } catch(err) {
    test.ok(err instanceof Error);
    test.equal("database name cannot be the empty string", err.message);              
  }
  
  try {
    new Db("te$t", function(err, collection) {});
  } catch(err) {
    test.equal("database names cannot contain the character '$'", err.message);
  }

  try {
    new Db(".test", function(err, collection) {});
  } catch(err) {
    test.equal("database names cannot contain the character '.'", err.message);
  }

  try {
    new Db("\\test", function(err, collection) {});
  } catch(err) {
    test.equal("database names cannot contain the character '\\'", err.message);
  }

  try {
    new Db("\\test", function(err, collection) {});
  } catch(err) {
    test.equal("database names cannot contain the character '\\'", err.message);
  }

  try {
    new Db("test test", function(err, collection) {});
  } catch(err) {
    test.equal("database names cannot contain the character ' '", err.message);
  }
  
  test.done();
}
  
/**
 * @ignore
 */
exports.shouldCorrectlyPerformAutomaticConnect = function(test) {
  var automatic_connect_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null), retryMiliSeconds:50});
  automatic_connect_client.open(function(err, automatic_connect_client) {
    // Listener for closing event
    var closeListener = function(has_error) {
      // Let's insert a document
      automatic_connect_client.collection('test_object_id_generation.data2', function(err, collection) {
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, {safe:true}, function(err, ids) {
          test.equal(1, ids.length);
          test.ok(ids[0]._id.toHexString().length == 24);

          collection.findOne({"name":"Patty"}, function(err, document) {
            test.equal(ids[0]._id.toHexString(), document._id.toHexString());
            // Let's close the db
            automatic_connect_client.close();
            test.done();
          });
        });
      });
    };
    
    // Add listener to close event
    automatic_connect_client.on("close", closeListener);
    automatic_connect_client.close();
  });    
}

/**
 * An example that shows how to force close a db connection so it cannot be reused.
 *
 * @_class db
 * @_function close
 * @ignore
 */
exports.shouldCorrectlyFailOnRetryDueToAppCloseOfDb = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch a collection
    db.collection('shouldCorrectlyFailOnRetryDueToAppCloseOfDb', function(err, collection) {

      // Insert a document
      collection.insert({a:1}, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Force close the connection
        db.close(true, function(err, result) {
          
          // Attemp to insert should fail now with correct message 'db closed by application'
          collection.insert({a:2}, {safe:true}, function(err, result) {
            test.equal('db closed by application', err.message);
            test.done();
          });          
        });
      });    
    });
  });
}

/**
 * A whole bunch of examples on how to use eval on the server.
 *
 * @_class db
 * @_function eval
 * @ignore
 */
exports.shouldCorrectlyExecuteEvalFunctions = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Evaluate a function on the server with the parameter 3 passed in
    db.eval('function (x) {return x;}', [3], function(err, result) {      
      test.equal(3, result);
    });
  
    // Evaluate a function on the server with the parameter 3 passed in no lock aquired for eval
    // on server
    db.eval('function (x) {return x;}', [3], {nolock:true}, function(err, result) {
      test.equal(3, result);
    });
    
    // Evaluate a function on the server that writes to a server collection
    db.eval('function (x) {db.test_eval.save({y:x});}', [5], function(err, result) {
      // Locate the entry
      client.collection('test_eval', function(err, collection) {
        collection.findOne(function(err, item) {
          test.equal(5, item.y);
        });
      });
    });
    
    // Evaluate a function with 2 parameters passed in
    db.eval('function (x, y) {return x + y;}', [2, 3], function(err, result) {
      test.equal(5, result);
    });
    
    // Evaluate a function with no parameters passed in
    db.eval('function () {return 5;}', function(err, result) {
      test.equal(5, result);
    });
    
    // Evaluate a statement
    db.eval('2 + 3;', function(err, result) {
      test.equal(5, result);
    });
    
    // Evaluate a statement using the code object
    db.eval(new Code("2 + 3;"), function(err, result) {
      test.equal(5, result);
    });
    
    // Evaluate a statement using the code object including a scope
    db.eval(new Code("return i;", {'i':2}), function(err, result) {
      test.equal(2, result);
    });
    
    // Evaluate a statement using the code object including a scope
    db.eval(new Code("i + 3;", {'i':2}), function(err, result) {
      test.equal(5, result);
      test.done();
    });
    
    // Evaluate an illegal statement
    db.eval("5 ++ 5;", function(err, result) {
      test.ok(err instanceof Error);
      test.ok(err.message != null);
      // Let's close the db
      test.done();
    });
    
    db.close();
    test.done();
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyDereferenceDbRef = function(test) {
  client.createCollection('test_deref', function(err, collection) {
    collection.insert({'a':1}, {safe:true}, function(err, ids) {
      collection.remove({}, {safe:true}, function(err, result) {
        collection.count(function(err, count) {
          test.equal(0, count);

          // Execute deref a db reference
          client.dereference(new DBRef("test_deref", new ObjectID()), function(err, result) {
            collection.insert({'x':'hello'}, {safe:true}, function(err, ids) {
              collection.findOne(function(err, document) {
                test.equal('hello', document.x);

                client.dereference(new DBRef("test_deref", document._id), function(err, result) {
                  test.equal('hello', document.x);

                  client.dereference(new DBRef("test_deref", 4), function(err, result) {
                    var obj = {'_id':4};

                    collection.insert(obj, {safe:true}, function(err, ids) {
                      client.dereference(new DBRef("test_deref", 4), function(err, document) {

                        test.equal(obj['_id'], document._id);
                        collection.remove({}, {safe:true}, function(err, result) {
                          collection.insert({'x':'hello'}, {safe:true}, function(err, ids) {
                            client.dereference(new DBRef("test_deref", null), function(err, result) {
                              test.equal(null, result);
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
          });  
        })
      })
    })
  });
}

/**
 * An example of illegal and legal renaming of a collection
 *
 * @_class collection
 * @_function rename
 * @ignore
 */
exports.shouldCorrectlyRenameCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    
    // Open a couple of collections
    db.createCollection('test_rename_collection', function(err, collection1) {
      db.createCollection('test_rename_collection2', function(err, collection2) {        

        // Attemp to rename a collection to a number
        try {
          collection1.rename(5, function(err, collection) {});         
        } catch(err) {
          test.ok(err instanceof Error);
          test.equal("collection name must be a String", err.message);
        }

        // Attemp to rename a collection to an empty string
        try {
          collection1.rename("", function(err, collection) {});
        } catch(err) {
          test.ok(err instanceof Error);
          test.equal("collection names cannot be empty", err.message);              
        }

        // Attemp to rename a collection to an illegal name including the character $
        try {
          collection1.rename("te$t", function(err, collection) {});
        } catch(err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not contain '$'", err.message);
        }

        // Attemp to rename a collection to an illegal name starting with the character .
        try {
          collection1.rename(".test", function(err, collection) {});
        } catch(err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not start or end with '.'", err.message);
        }

        // Attemp to rename a collection to an illegal name ending with the character .
        try {
          collection1.rename("test.", function(err, collection) {});
        } catch(err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not start or end with '.'", err.message);
        }

        // Attemp to rename a collection to an illegal name with an empty middle name
        try {
          collection1.rename("tes..t", function(err, collection) {});
        } catch(err) {
          test.equal("collection names cannot be empty", err.message);
        }

        // Insert a couple of documents
        collection1.insert([{'x':1}, {'x':2}], {safe:true}, function(err, docs) {

          // Attemp to rename the first collection to the second one, this will fail
          collection1.rename('test_rename_collection2', function(err, collection) {
            test.ok(err instanceof Error);
            test.ok(err.message.length > 0);
    
            // Attemp to rename the first collection to a name that does not exist
            // this will be succesful
            collection1.rename('test_rename_collection3', function(err, collection) {
              test.equal("test_rename_collection3", collection.collectionName);
    
              // Ensure that the collection is pointing to the new one
              collection1.count(function(err, count) {
                test.equal(2, count);
                db.close();
                test.done();
              });
            });
          });
        })
      });
    });
  });
}

/**
 * An example of a simple single server db connection
 *
 * @_class db
 * @_function open
 * @ignore
 */
exports.shouldCorrectlyOpenASimpleDbSingleServerConnection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    db.close();
    test.done();
  });
}

/**
 * An example of a simple single server db connection and close function
 *
 * @_class db
 * @_function close
 * @ignore
 */
exports.shouldCorrectlyOpenASimpleDbSingleServerConnection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Close the connection with a callback that is optional
    db.close(function(err, result) {
      test.equal(null, err);
            
      test.done();
    });
  });
}

/**
 * An example of retrieveing the information of all the collections.
 *
 * @_class db
 * @_function collectionsInfo
 * @ignore
 */
exports.shouldCorrectlyRetrieveCollectionInfo = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection('test_collections_info', function(err, r) {
      test.equal(null, err);
      
      // Return the information of a single collection name
      db.collectionsInfo("test_collections_info").toArray(function(err, items) {
        test.equal(1, items.length);

        // Return the information of a all collections, using the callback format
        db.collectionsInfo(function(err, cursor) {

          // Turn the cursor into an array of results
          cursor.toArray(function(err, items) {
            test.ok(items.length > 0);

            db.close();
            test.done();
          });
        })
      });      
    });
  });
}

/**
 * An example of retrieveing the collection names for a database.
 *
 * @_class db
 * @_function collectionNames
 * @ignore
 */
exports.shouldCorrectlyRetrieveCollectionInfo = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection('test_collections_info', function(err, r) {
      test.equal(null, err);
      
      // Return the information of a single collection name
      db.collectionNames("test_collections_info", function(err, items) {
        test.equal(1, items.length);

        // Return the information of a all collections, using the callback format
        db.collectionNames(function(err, items) {
          test.ok(items.length > 0);

          db.close();
          test.done();
        });
      });      
    });
  });
}

/**
 * An example of retrieving a collection from a db using the collection function.
 *
 * @_class db
 * @_function collection
 * @ignore
 */
exports.shouldCorrectlyAccessACollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Grab a collection without a callback no safe mode
    var col1 = db.collection('test_correctly_access_collections');
    
    // Grab a collection with a callback but no safe operation
    db.collection('test_correctly_access_collections', function(err, col2) {
      test.equal(null, err);
      
      // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
      db.collection('test_correctly_access_collections', {safe:true}, function(err, col3) {
        test.ok(err != null);
        
        // Create the collection
        db.createCollection('test_correctly_access_collections', function(err, result) {

          // Retry to get the collection, should work as it's now created
          db.collection('test_correctly_access_collections', {safe:true}, function(err, col3) {
            test.equal(null, err);
          
            db.close();
            test.done();        
          });
        });        
      });      
    });
  });
}

/**
 * An example of retrieving all collections for a db as Collection objects
 *
 * @_class db
 * @_function collections
 * @ignore
 */
exports.shouldCorrectlyRetrieveAllCollections = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
        
    // Create the collection
    db.createCollection('test_correctly_access_collections', function(err, result) {

      // Retry to get the collection, should work as it's now created
      db.collections(function(err, collections) {
        test.equal(null, err);
        test.ok(collections.length > 0);
      
        db.close();
        test.done();        
      });
    });        
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleFailedConnection = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 25117, {auto_reconnect: false, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    test.ok(err != null)
    test.done();
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyResaveDBRef = function(test) {
  client.dropCollection('test_resave_dbref', function() {
    client.createCollection('test_resave_dbref', function(err, collection) {
      test.ifError(err);

      collection.insert({'name': 'parent'}, {safe : true}, function(err, objs) {
         test.ok(objs && objs.length == 1 && objs[0]._id != null);
         var parent = objs[0];
         var child = {'name' : 'child', 'parent' : new DBRef("test_resave_dbref",  parent._id)};

         collection.insert(child, {safe : true}, function(err, objs) {
           test.ifError(err);

           collection.findOne({'name' : 'child'}, function(err, child) { //Child deserialized
              test.ifError(err);
              test.ok(child != null);

              collection.save(child, {save : true}, function(err) {
                test.ifError(err); //Child node with dbref resaved!
                
                collection.findOne({'parent' : new DBRef("test_resave_dbref",  parent._id)},
                  function(err, child) {
                    test.ifError(err);
                    test.ok(child != null);//!!!! Main test point!
                    test.done();
                  })
              });
           });
         });
      });
    });
  });
},
  
/**
 * An example of dereferencing values.
 *
 * @_class db
 * @_function dereference
 * @ignore
 */
exports.shouldCorrectlyDereferenceDbRefExamples = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);

    // Get a second db
    var secondDb = db.db('integration_tests_2');

    // Create a dereference example
    secondDb.createCollection('test_deref_examples', function(err, collection) {
      
      // Insert a document in the collection
      collection.insert({'a':1}, {safe:true}, function(err, ids) {
        
        // Let's build a db reference and resolve it
        var dbRef = new DBRef('test_deref_examples', ids[0]._id, 'integration_tests_2');
        
        // Resolve it including a db resolve
        db.dereference(dbRef, function(err, item) {          
          test.equal(1, item.a);

          // Let's build a db reference and resolve it
          var dbRef = new DBRef('test_deref_examples', ids[0]._id);

          // Simple local resolve
          secondDb.dereference(dbRef, function(err, item) {          
            test.equal(1, item.a);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * An example of using the logout command for the database.
 *
 * @_class db
 * @_function logout
 * @ignore
 */
exports.shouldCorrectlyLogoutFromTheDatabase = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);

    // Add a user to the database
    db.addUser('user', 'name', function(err, result) {
      test.equal(null, err);
      
      // Authenticate
      db.authenticate('user', 'name', function(err, result) {
        test.equal(true, result);

        // Logout the db
        db.logout(function(err, result) {
          test.equal(true, result);
          
          db.close();
          test.done();
        });        
      });      
    });
  });
}

/**
 * An example of using the authenticate command.
 *
 * @_class db
 * @_function authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAgainstTheDatabase = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);

    // Add a user to the database
    db.addUser('user', 'name', function(err, result) {
      test.equal(null, err);
      
      // Authenticate
      db.authenticate('user', 'name', function(err, result) {
        test.equal(true, result);

        db.close();
        test.done();
      });      
    });
  });
}

/**
 * An example of adding a user to the database.
 *
 * @_class db
 * @_function addUser
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAgainstTheDatabase = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);

    // Add a user to the database
    db.addUser('user', 'name', function(err, result) {
      test.equal(null, err);
      
      db.close();
      test.done();
    });
  });
}

/**
 * An example of dereferencing values.
 *
 * @_class db
 * @_function removeUser
 * @ignore
 */
exports.shouldCorrectlyAddAndRemoveUser = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);

    // Add a user to the database
    db.addUser('user', 'name', function(err, result) {
      test.equal(null, err);
      
      // Authenticate
      db.authenticate('user', 'name', function(err, result) {
        test.equal(true, result);

        // Logout the db
        db.logout(function(err, result) {
          test.equal(true, result);

          // Remove the user from the db
          db.removeUser('user', function(err, result) {
                        
            // Authenticate
            db.authenticate('user', 'name', function(err, result) {
              test.equal(false, result);

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
 * A simple example showing the creation of a collection.
 *
 * @_class db
 * @_function createCollection
 * @ignore
 */
exports.shouldCorrectlyCreateACollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a capped collection with a maximum of 1000 documents
    db.createCollection("a_simple_collection", {capped:true, size:10000, max:1000, safe:true}, function(err, collection) {
      test.equal(null, err);
      
      // Insert a document in the capped collection
      collection.insert({a:1}, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        db.close();
        test.done();
      });      
    });
  });
}

/**
 * A simple example executing a command against the server.
 *
 * @_class db
 * @_function dropCollection
 * @ignore
 */
exports.shouldCorrectlyExecuteACommandAgainstTheServer = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Execute ping against the server
    db.command({ping:1}, function(err, result) {
      test.equal(null, err);
      
      // Create a capped collection with a maximum of 1000 documents
      db.createCollection("a_simple_create_drop_collection", {capped:true, size:10000, max:1000, safe:true}, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        collection.insert({a:1}, {safe:true}, function(err, result) {
          test.equal(null, err);

          // Drop the collection from this world
          db.dropCollection("a_simple_create_drop_collection", function(err, result) {
            test.equal(null, err);

            // Verify that the collection is gone
            db.collectionNames("a_simple_create_drop_collection", function(err, names) {
              test.equal(0, names.length);
              
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
 * A simple example creating, dropping a collection and then verifying that the collection is gone.
 *
 * @_class db
 * @_function command
 * @ignore
 */
exports.shouldCorrectlyCreateDropAndVerifyThatCollectionIsGone = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Execute ping against the server
    db.command({ping:1}, function(err, result) {
      test.equal(null, err);
      
      db.close();
      test.done();
    });    
  });
}

/**
 * A simple example creating, dropping a collection and then verifying that the collection is gone.
 *
 * @_class db
 * @_function renameCollection
 * @ignore
 */
exports.shouldCorrectlyRenameACollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection("simple_rename_collection", {safe:true}, function(err, collection) {
      test.equal(null, err);
      
      // Insert a document in the collection
      collection.insert({a:1}, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Rename the collection
        db.renameCollection("simple_rename_collection", "simple_rename_collection_2", function(err, collection2) {
          test.equal(null, err);          
          
          // Retrieve the number of documents from the collection
          collection2.count(function(err, count) {
            test.equal(1, count);
            
            // Verify that the collection is gone
            db.collectionNames("simple_rename_collection", function(err, names) {
              test.equal(0, names.length);
              
              // Verify that the new collection exists
              db.collectionNames("simple_rename_collection_2", function(err, names) {
                test.equal(1, names.length);

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

/**
 * A simple example using lastError on a single connection with a pool of 1.
 *
 * @_class db
 * @_function lastError
 * @ignore
 */
exports.shouldCorrectlyUseLastError = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection("simple_rename_collection", {safe:true}, function(err, collection) {
      test.equal(null, err);
      
      // Insert a document in the collection
      collection.insert({a:1}, function(err, result) {
        test.equal(null, err);

        // Execute lastError
        db.lastError(function(err, result) {
          test.equal(null, err);
          test.equal(null, result[0].err);
          
          // Pick a specific connection and execute lastError against it
          var connection = db.serverConfig.checkoutWriter();
          // Execute lastError
          db.lastError({}, {connection:connection}, function(err, result) {
            test.equal(null, err);
            test.equal(null, result[0].err);
            
            db.close();
            test.done();
          });                    
        });
      });      
    });
  });
}

/**
 * A simple example using previousError to return the list of all errors, might be deprecated in the future.
 *
 * @_class db
 * @_function previousErrors
 * @ignore
 */
exports.shouldCorrectlyUsePreviousError = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection("simple_previous_error_coll", {safe:true}, function(err, collection) {
      test.equal(null, err);
      
      // Force a unique index
      collection.ensureIndex({a:1}, {unique:true}, function(err, result) {
        test.equal(null, err);
        
        // Force some errors
        collection.insert([{a:1}, {a:1}, {a:1}, {a:2}], function(err, result) {
          
          // Pick a specific connection and execute lastError against it
          var connection = db.serverConfig.checkoutWriter();

          // Execute previousErrors
          db.previousErrors({connection:connection}, function(err, result) {
            test.equal(null, err);
            test.equal(1, result.length);
            test.ok(result[0].err != null);

            db.close();
            test.done();
          });          
        });        
      });
    });
  });
}

/**
 * A simple example using resetErrorHistory to clean up the history of errors.
 *
 * @_class db
 * @_function resetErrorHistory
 * @ignore
 */
exports.shouldCorrectlyUseResetErrorHistory = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    
    test.equal(null, err);
    
    // Create a collection
    db.createCollection("simple_reset_error_history_coll", {safe:true}, function(err, collection) {
      test.equal(null, err);
      
      // Force a unique index
      collection.ensureIndex({a:1}, {unique:true}, function(err, result) {
        test.equal(null, err);
        
        // Force some errors
        collection.insert([{a:1}, {a:1}, {a:1}, {a:2}], function(err, result) {                    
          // Pick a specific connection and execute lastError against it
          var connection = db.serverConfig.checkoutWriter();

          // Reset the error history
          db.resetErrorHistory({connection:connection}, function(err, result) {
            
            // Execute previousErrors and validate that there are no errors left
            db.previousErrors({connection:connection}, function(err, result) {
              test.equal(null, err);
              test.equal(1, result.length);
              test.equal(null, result[0].err);

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
 * A more complex createIndex using a compound unique index in the background and dropping duplicated documents
 *
 * @_class db
 * @_function createIndex
 */
exports.shouldCreateComplexIndexOnTwoFields = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
  
    // Create a collection we want to drop later
    db.createCollection('more_complex_index_test', function(err, collection) {      
      test.equal(null, err);

      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
  
        // Create an index on the a field
        db.createIndex('more_complex_index_test', {a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
    
          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);
      
            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
              test.ok(explanation[0].indexBounds.a != null);
              test.ok(explanation[0].indexBounds.b != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
  });
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents.
 *
 * @_class db
 * @_function ensureIndex
 */
exports.shouldCreateComplexEnsureIndex = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('more_complex_ensure_index_test', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        db.ensureIndex('more_complex_ensure_index_test', {a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);
        
            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
              test.ok(explanation[0].indexBounds.a != null);
              test.ok(explanation[0].indexBounds.b != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
  });
}

/**
 * A Simple example of returning current cursor information in MongoDB
 *
 * @_class db
 * @_function cursorInfo
 */
exports.shouldCorrectlyReturnCursorInformation = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('cursor_information_collection', function(err, collection) {      
      test.equal(null, err);
  
      // Create a bunch of documents so we can force the creation of a cursor
      var docs = [];      
      for(var i = 0; i < 1000; i++) {
        docs.push({a:'hello world hello world hello world hello world hello world hello world hello world hello world'});
      }
  
      // Insert a bunch of documents for the index
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);

        // Let's set a cursor
        var cursor = collection.find({}, {batchSize:10});
        cursor.nextObject(function(err, item) {
          test.equal(null, err);
          
          // Let's grab the information about the cursors on the database
          db.cursorInfo(function(err, cursorInformation) {
            test.ok(cursorInformation.totalOpen > 0);
            
            db.close();
            test.done();
          });          
        });    
      });
    });
  });
}

/**
 * An examples showing the creation and dropping of an index
 *
 * @_class db
 * @_function dropIndex
 */
exports.shouldCorrectlyCreateAndDropIndex = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('create_and_drop_an_index', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Drop the index
          db.dropIndex("create_and_drop_an_index", "a_1_b_1", function(err, result) {
            test.equal(null, err);
        
            // Verify that the index is gone
            collection.indexInformation(function(err, indexInformation) {              
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.equal(null, indexInformation.a_1_b_1);

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
 * An example showing how to force a reindex of a collection.
 *
 * @_class db
 * @_function reIndex
 */
exports.shouldCorrectlyForceReindexOnCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('create_and_drop_all_indexes', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {

          // Force a reindex of the collection
          db.reIndex('create_and_drop_all_indexes', function(err, result) {
            test.equal(null, err);
            test.equal(true, result);
        
            // Verify that the index is gone
            collection.indexInformation(function(err, indexInformation) {
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

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
 * An example showing the information returned by indexInformation
 *
 * @_class db
 * @_function indexInformation
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformation = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('more_index_information_test', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Fetch basic indexInformation for collection
          db.indexInformation('more_index_information_test', function(err, indexInformation) {
            test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
            test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

            // Fetch full index information
            collection.indexInformation({full:true}, function(err, indexInformation) {
              test.deepEqual({ _id: 1 }, indexInformation[0].key);
              test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

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
 * An examples showing the dropping of a database
 *
 * @_class db
 * @_function dropDatabase
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformation = function(test) {
  var db = new Db('integration_tests_to_drop', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection
    db.createCollection('more_index_information_test', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Let's drop the database
        db.dropDatabase(function(err, result) {
          test.equal(null, err);
          
          // Get the admin database
          db.admin().listDatabases(function(err, dbs) {
            // Grab the databases
            dbs = dbs.databases;
            // Did we find the db
            var found = false;
            
            // Check if we have the db in the list
            for(var i = 0; i < dbs.length; i++) {
              if(dbs[i].name == 'integration_tests_to_drop') found = true;
            }
            
            // We should not find the databases
            test.equal(false, found);
            
            db.close();
            test.done();
          });          
        });    
      });
    });
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;