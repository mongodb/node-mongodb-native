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
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var native_parser = (process.env['TEST_NATIVE'] != null);

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
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
 * @ignore
 */
exports.shouldCorrectlyExecuteEvalFunctions = function(test) {
  client.eval('function (x) {return x;}', [3], function(err, result) {      
    test.equal(3, result);
  });
  
  client.eval('function (x) {return x;}', [3], {nolock:true}, function(err, result) {
    test.equal(3, result);
  });
    
  client.eval('function (x) {db.test_eval.save({y:x});}', [5], function(err, result) {
    // Locate the entry
    client.collection('test_eval', function(err, collection) {
      collection.findOne(function(err, item) {
        test.equal(5, item.y);
      });
    });
  });
    
  client.eval('function (x, y) {return x + y;}', [2, 3], function(err, result) {
    test.equal(5, result);
  });
    
  client.eval('function () {return 5;}', function(err, result) {
    test.equal(5, result);
  });
    
  client.eval('2 + 3;', function(err, result) {
    test.equal(5, result);
  });
    
  client.eval(new Code("2 + 3;"), function(err, result) {
    test.equal(5, result);
  });
    
  client.eval(new Code("return i;", {'i':2}), function(err, result) {
    test.equal(2, result);
  });
    
  client.eval(new Code("i + 3;", {'i':2}), function(err, result) {
    test.equal(5, result);
    test.done();
  });
    
  client.eval("5 ++ 5;", function(err, result) {
    test.ok(err instanceof Error);
    test.ok(err.message != null);
    // Let's close the db
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
 * @ignore
 */
exports.shouldCorrectlyHandleFailedConnection = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27117, {auto_reconnect: false, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
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