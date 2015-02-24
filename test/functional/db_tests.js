"use strict";

/**
 * @ignore
 */
exports.shouldCorrectlyHandleIllegalDbNames = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformAutomaticConnect = {
  metadata: { requires: { topology: 'single' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var automatic_connect_client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:true});
    automatic_connect_client.open(function(err, automatic_connect_client) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = automatic_connect_client.collection('test_object_id_generation_data2');
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, configuration.writeConcernMax(), function(err, r) {
          test.equal(1, r.length);
          test.ok(r[0]._id.toHexString().length == 24);

          collection.findOne({"name":"Patty"}, function(err, document) {
            test.equal(r[0]._id.toHexString(), document._id.toHexString());
            // Let's close the db
            automatic_connect_client.close();
            test.done();
          });
        });
      };

      // Add listener to close event
      automatic_connect_client.once("close", closeListener);
      // Ensure death of server instance
      automatic_connect_client.serverConfig.connectionPool.openConnections[0].connection.destroy();
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformAutomaticConnectWithMaxBufferSize0 = {
  metadata: { requires: { topology: 'single' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var automatic_connect_client = configuration.newDbInstance({w:1, bufferMaxEntries:0}, {poolSize:1, auto_reconnect:true});
    automatic_connect_client.open(function(err, automatic_connect_client) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = automatic_connect_client.collection('test_object_id_generation_data2');
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, configuration.writeConcernMax(), function(err, ids) {
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          automatic_connect_client.close();
          test.done();
        });
      };

      // Add listener to close event
      automatic_connect_client.once("close", closeListener);
      // Ensure death of server instance
      automatic_connect_client.serverConfig.connectionPool.openConnections[0].connection.destroy();
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleFailedConnection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Server = configuration.require.Server;

    var fs_client = new Db(configuration.database, new Server("127.0.0.1", 25117, {auto_reconnect: false}), configuration.writeConcernMax());
    fs_client.open(function(err, fs_client) {
      test.ok(err != null)
      test.done();
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyResaveDBRef = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var DBRef = configuration.require.DBRef;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.dropCollection('test_resave_dbref', function() {
        test.equal(null, err);

        db.createCollection('test_resave_dbref', function(err, collection) {
          test.equal(null, err);

          collection.insert({'name': 'parent'}, {safe : true}, function(err, r) {
            test.equal(null, err);
            test.ok(r.length == 1 && r[0]._id != null);
            var parent = r[0];
            var child = {'name' : 'child', 'parent' : new DBRef("test_resave_dbref",  parent._id)};

            collection.insert(child, {safe : true}, function(err, objs) {
              test.equal(null, err);

              collection.findOne({'name' : 'child'}, function(err, child) { //Child deserialized
                test.ok(child != null);

                collection.save(child, {save : true}, function(err) {
                  test.equal(null, err);

                  collection.findOne({'parent' : new DBRef("test_resave_dbref",  parent._id)},
                    function(err, child) {
                      test.ok(child != null);//!!!! Main test point!
                      db.close();
                      test.done();
                  })
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * An example showing how to force a reindex of a collection.
 */
exports.shouldCorrectlyForceReindexOnCollection = {
  metadata: {
    requires: { topology: ["single", "replicaset"] }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection we want to drop later
      db.createCollection('create_and_drop_all_indexes', function(err, collection) {
        test.equal(null, err);

        // Insert a bunch of documents for the index
        collection.insert([{a:1, b:1}
          , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          // Create an index on the a field
          collection.ensureIndex({a:1, b:1}
            , {unique:true, background:true, w:1}, function(err, indexName) {

            // Force a reindex of the collection
            collection.reIndex('create_and_drop_all_indexes', function(err, result) {
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
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyGetErrorDroppingNonExistingDb = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {
      var _db = db.db("nonexistingdb");
      // Let's drop the database
      _db.dropDatabase(function(err, result) {
        test.equal(null, err);
        test.equal(true, result);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyThrowWhenTryingToReOpenConnection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {
      try {
        db.open(function(err, db) {
        });

        test.ok(false);
      } catch (err) {
        test.done();
      }
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReconnectWhenError = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Server = configuration.require.Server;

    var db = new Db('integration_tests_to_drop_2', new Server("127.0.0.1", 27088,
      {auto_reconnect: false, poolSize: 4}), configuration.writeConcernMax());
    // Establish connection to db
    db.open(function(err, _db) {
      test.ok(err != null);

      db.open(function(err, _db) {
        test.ok(err != null);
        db.close();
        test.done();
      })
    });
  }
}

/**
 * @ignore
 */
exports['should correctly list collection names with . in the middle'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Server = configuration.require.Server;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      // Get a db we that does not have any collections
      var db1 = db.db('shouldCorrectlyListCollectionsWithDotsOnThem');

      // Create a collection
      db1.collection('test.collection1').insert({a:1}, function(err) {
        test.equal(null, err);

        // Create a collection
        db1.collection('test.collection2').insert({a:1}, function() {
          test.equal(null, err);
          
          // Get listCollections filtering out the name
          var cursor = db1.listCollections({name: /test.collection/});
          cursor.toArray(function(err, names) {
            test.equal(null, err);
            test.equal(2, names.length);

            // Get listCollections filtering out the name
            var cursor = db1.listCollections({name: 'test.collection1'}, {});
            cursor.toArray(function(err, names) {
              test.equal(null, err);
              test.equal(1, names.length);

              db.close();
              test.done();
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
exports['should correctly list collection names with batchSize 1 for 2.8 or higher'] = {
  metadata: { requires: { 
      topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] 
    , mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Server = configuration.require.Server;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      // Get a db we that does not have any collections
      var db1 = db.db('shouldCorrectlyListCollectionsWithDotsOnThemFor28');

      // Create a collection
      db1.collection('test.collection1').insert({a:1}, function(err) {
        test.equal(null, err);

        // Create a collection
        db1.collection('test.collection2').insert({a:1}, function() {
          test.equal(null, err);
          
          // Get listCollections filtering out the name
          var cursor = db1.listCollections({name: /test.collection/}, {batchSize:1});
          cursor.toArray(function(err, names) {
            test.equal(null, err);
            test.equal(2, names.length);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCrashOnBadPoolSize = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:'bad!'});
    test.throws(function() {
      db.open(function() {
        db.close();
      });
    });
    test.done();
  }
}
