var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;
var native_parser = (process.env['TEST_NATIVE'] != null);

/*!
 * Module dependencies.
 */
var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
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
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollection = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      fs_client.collection('test', function(err, collection) {
        collection.insert({'a':1}, {safe:true}, function(err, doc) {
          fs_client.admin(function(err, adminDb) {
            adminDb.addUser('admin', 'admin', function(err, result) {
              adminDb.authenticate('admin', 'admin', function(err, replies) {
                adminDb.validateCollection('test', function(err, doc) {
                  // Pre 1.9.1 servers
                  if(doc.result != null) {
                    test.ok(doc.result != null);
                    test.ok(doc.result.match(/firstExtent/) != null);                    
                  } else {
                    test.ok(doc.firstExtent != null);
                  }

                  fs_client.close();
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
 * Authenticate against MongoDB Admin user
 *
 * @_class admin
 * @_function authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Grab a collection object
      db.collection('test', function(err, collection) {

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({'a':1}, {safe:true}, function(err, doc) {

          // Use the admin database for the operation
          db.admin(function(err, adminDb) {

           // Add the new user to the admin database
           adminDb.addUser('admin', 'admin', function(err, result) {

             // Authenticate using the newly added user
             adminDb.authenticate('admin', 'admin', function(err, result) {
               test.ok(result);

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
 * Example showing how to access the Admin database for admin level operations.
 *
 * @_class db
 * @_function admin
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Use the admin database for the operation
    db.admin(function(err, adminDb) {
      test.equal(null, err);
      
      db.close();
      test.done();
    });
  });
}

/**
 * Retrieve the buildInfo for the current MongoDB instance
 *
 * @_class admin
 * @_function buildInfo
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {

        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            // Retrive the build information for the MongoDB instance
            adminDb.buildInfo(function(err, info) {
              test.ok(err == null);
              
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
 * Retrieve the buildInfo using the command function
 *
 * @_class admin
 * @_function command
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {

        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            // Retrive the build information using the admin command
            adminDb.command({buildInfo:1}, function(err, info) {
              test.ok(err == null);
              
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
 * Retrieve the current profiling level set for the MongoDB instance
 *
 * @_class admin
 * @_function profilingLevel
 * @ignore
 */
exports.shouldCorrectlySetDefaultProfilingLevel = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Grab a collection object
      db.collection('test', function(err, collection) {

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({'a':1}, {safe:true}, function(err, doc) {

          // Use the admin database for the operation
          db.admin(function(err, adminDb) {

            // Add the new user to the admin database
            adminDb.addUser('admin', 'admin', function(err, result) {

              // Authenticate using the newly added user
              adminDb.authenticate('admin', 'admin', function(err, replies) {

                // Retrive the profiling level
                adminDb.profilingLevel(function(err, level) {
                  test.equal("off", level);                

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
 * An example of how to use the setProfilingInfo
 * Use this command to set the Profiling level on the MongoDB server
 * 
 * @_class admin
 * @_function setProfilingLevel
 */ 
exports.shouldCorrectlyChangeProfilingLevel = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Grab a collection object
      db.collection('test', function(err, collection) {

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({'a':1}, {safe:true}, function(err, doc) {

          // Use the admin database for the operation
          db.admin(function(err, adminDb) {

            // Add the new user to the admin database
            adminDb.addUser('admin', 'admin', function(err, result) {

              // Authenticate using the newly added user
              adminDb.authenticate('admin', 'admin', function(err, replies) {                                
                
                // Set the profiling level to only profile slow queries
                adminDb.setProfilingLevel('slow_only', function(err, level) {
                  
                  // Retrive the profiling level and verify that it's set to slow_only
                  adminDb.profilingLevel(function(err, level) {
                    test.equal('slow_only', level);

                    // Turn profiling off
                    adminDb.setProfilingLevel('off', function(err, level) {
                      
                      // Retrive the profiling level and verify that it's set to off
                      adminDb.profilingLevel(function(err, level) {
                        test.equal('off', level);

                        // Set the profiling level to log all queries
                        adminDb.setProfilingLevel('all', function(err, level) {

                          // Retrive the profiling level and verify that it's set to all
                          adminDb.profilingLevel(function(err, level) {
                            test.equal('all', level);

                            // Attempt to set an illegal profiling level
                            adminDb.setProfilingLevel('medium', function(err, level) {
                              test.ok(err instanceof Error);
                              test.equal("Error: illegal profiling level value medium", err.message);
                            
                              db.close();
                              test.done();
                            });
                          })
                        });
                      })
                    });
                  })
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
 * An example of how to use the profilingInfo
 * Use this command to pull back the profiling information currently set for Mongodb
 * 
 * @_class admin
 * @_function profilingInfo
 */ 
exports.shouldCorrectlySetAndExtractProfilingInfo = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Grab a collection object
      db.collection('test', function(err, collection) {

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({'a':1}, {safe:true}, function(doc) {

          // Use the admin database for the operation
          db.admin(function(err, adminDb) {

            // Add the new user to the admin database
            adminDb.addUser('admin', 'admin', function(err, result) {

              // Authenticate using the newly added user
              adminDb.authenticate('admin', 'admin', function(err, replies) {
                
                // Set the profiling level to all
                adminDb.setProfilingLevel('all', function(err, level) {
                  
                  // Execute a query command
                  collection.find(function(err, cursor) {
                    cursor.toArray(function(err, items) {

                      // Turn off profiling
                      adminDb.setProfilingLevel('off', function(err, level) {
                        
                        // Retrive the profiling information
                        adminDb.profilingInfo(function(err, infos) {
                          test.ok(infos.constructor == Array);
                          test.ok(infos.length >= 1);
                          test.ok(infos[0].ts.constructor == Date);
                          test.ok(infos[0].millis.constructor == Number);
                        
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
        });
      });
    });
  });
}

/**
 * An example of how to use the validateCollection command
 * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
 * 
 * @_class admin
 * @_function validateCollection
 */
exports.shouldCorrectlyCallValidateCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});
  
  // Establish connection to db  
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {

      // Grab a collection object
      db.collection('test', function(err, collection) {
        
        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({'a':1}, {safe:true}, function(err, doc) {
          
          // Use the admin database for the operation
          db.admin(function(err, adminDb) {
            
            // Add the new user to the admin database
            adminDb.addUser('admin', 'admin', function(err, result) {
              
              // Authenticate using the newly added user
              adminDb.authenticate('admin', 'admin', function(err, replies) {
                
                // Validate the 'test' collection
                adminDb.validateCollection('test', function(err, doc) {

                  // Pre 1.9.1 servers
                  if(doc.result != null) {
                    test.ok(doc.result != null);
                    test.ok(doc.result.match(/firstExtent/) != null);                    
                  } else {
                    test.ok(doc.firstExtent != null);
                  }

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
 * An example of how to add a user to the admin database
 * 
 * @_class admin
 * @_function ping
 */
exports.shouldCorrectlyPingTheMongoDbInstance = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {          

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {
        
        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {
          
          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            // Ping the server
            adminDb.ping(function(err, pingResult) {
              test.equal(null, err);

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
 * An example of how add a user, authenticate and logout
 * 
 * @_class admin
 * @_function logout
 */
exports.shouldCorrectlyUseLogoutFunction = function(test) {  
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {          

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {
        
        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {
          
          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            // Logout the user
            adminDb.logout(function(err, result) {
              test.equal(true, result);
              
              db.close();
              test.done();
            })            
          });                
        });
      });
    });
  });
}


/**
 * An example of how to add a user to the admin database
 * 
 * @_class admin
 * @_function addUser
 */
exports.shouldCorrectlyAddAUserToAdminDb = function(test) {  
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {          

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {
        
        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {
          
          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            db.close();
            test.done();
          });                
        });
      });
    });
  });
}

/**
 * An example of how to remove a user from the admin database
 * 
 * @_class admin
 * @_function removeUser
 */
exports.shouldCorrectlyAddAUserAndRemoveItFromAdminDb = function(test) {  
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Drop the current database if it exists to avoid problems
    db.dropDatabase(function(err, done) {          

      // Use the admin database for the operation
      db.admin(function(err, adminDb) {
        
        // Add the new user to the admin database
        adminDb.addUser('admin', 'admin', function(err, result) {
          
          // Authenticate using the newly added user
          adminDb.authenticate('admin', 'admin', function(err, result) {
            test.ok(result);
            
            // Remove the user
            adminDb.removeUser('admin', function(err, result) {
              
              // Authenticate using the removed user should fail
              adminDb.authenticate('admin', 'admin', function(err, result) {
                test.ok(err != null);
                test.ok(!result);

                db.close();
                test.done();
              });
            })            
          });                
        });
      });
    });
  });
}

/**
 * An example of listing all available databases.
 * 
 * @_class admin
 * @_function listDatabases
 */
exports.shouldCorrectlyListAllAvailableDatabases = function(test) {  
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    db.admin(function(err, adminDb) {
      
      // List all the available databases
      adminDb.listDatabases(function(err, dbs) {
        test.equal(null, err);
        test.ok(dbs.databases.length > 0);
        
        db.close();
        test.done();
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