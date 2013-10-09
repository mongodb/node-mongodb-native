/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var collection = db.collection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode');
    collection.insert({'a':1}, {w: 1}, function(err, doc) {
      var adminDb = db.admin();
      
      adminDb.addUser('admin', 'admin', function(err, result) {
        adminDb.authenticate('admin', 'admin', function(err, replies) {
          adminDb.validateCollection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode', function(err, doc) {
            // Pre 1.9.1 servers
            if(doc.result != null) {
              test.ok(doc.result != null);
              test.ok(doc.result.match(/firstExtent/) != null);                    
            } else {
              test.ok(doc.firstExtent != null);
            }

            adminDb.removeUser('admin', function(err) {
              test.equal(null, err);

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
 * Authenticate against MongoDB Admin user
 *
 * @_class admin
 * @_function authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});
  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  db.open(function(err, db) {
    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w:1}, function(err, doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin2', 'admin2', function(err, result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin2', 'admin2', function(err, result) {
          test.ok(result);

          adminDb.removeUser('admin2', function(err, result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * Example showing how to access the Admin database for admin level operations.
 *
 * @_class db
 * @_function admin
 * @ignore
 */
exports.accessAdminLevelOperations = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});
  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin()
    test.ok(adminDb != null);
    
    db.close();
    test.done();
  });
  // DOC_END
}

/**
 * Retrieve the buildInfo for the current MongoDB instance
 *
 * @_class admin
 * @_function buildInfo
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfo = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();

    // Add the new user to the admin database
    adminDb.addUser('admin3', 'admin3', function(err, result) {

      // Authenticate using the newly added user
      adminDb.authenticate('admin3', 'admin3', function(err, result) {
        test.ok(result);
        
        // Retrive the build information for the MongoDB instance
        adminDb.buildInfo(function(err, info) {
          test.ok(err == null);
          
          adminDb.removeUser('admin3', function(err, result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });
    });
  });            
  // DOC_END
}

/**
 * Retrieve the buildInfo using the command function
 *
 * @_class admin
 * @_function command
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfoUsingCommand = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();

    // Add the new user to the admin database
    adminDb.addUser('admin4', 'admin4', function(err, result) {

      // Authenticate using the newly added user
      adminDb.authenticate('admin4', 'admin4', function(err, result) {
        test.ok(result);
        
        // Retrive the build information using the admin command
        adminDb.command({buildInfo:1}, function(err, info) {
          test.ok(err == null);

          adminDb.removeUser('admin4', function(err, result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * Retrieve the current profiling level set for the MongoDB instance
 *
 * @_class admin
 * @_function profilingLevel
 * @ignore
 */
exports.shouldCorrectlySetDefaultProfilingLevel = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    
    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(err, doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin5', 'admin5', function(err, result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin5', 'admin5', function(err, replies) {

          // Retrive the profiling level
          adminDb.profilingLevel(function(err, level) {

            adminDb.removeUser('admin5', function(err, result) {
              test.ok(result);

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

/**
 * An example of how to use the setProfilingInfo
 * Use this command to set the Profiling level on the MongoDB server
 * 
 * @_class admin
 * @_function setProfilingLevel
 */ 
exports.shouldCorrectlyChangeProfilingLevel = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    
    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(err, doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin6', 'admin6', function(err, result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin6', 'admin6', function(err, replies) {                                
          
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
                      
                        adminDb.removeUser('admin6', function(err, result) {
                          test.ok(result);

                          db.close();
                          test.done();
                        });
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
  // DOC_END
}

/**
 * An example of how to use the profilingInfo
 * Use this command to pull back the profiling information currently set for Mongodb
 * 
 * @_class admin
 * @_function profilingInfo
 */ 
exports.shouldCorrectlySetAndExtractProfilingInfo = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin7', 'admin7', function(err, result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin7', 'admin7', function(err, replies) {
          
          // Set the profiling level to all
          adminDb.setProfilingLevel('all', function(err, level) {
            
            // Execute a query command
            collection.find().toArray(function(err, items) {

              // Turn off profiling
              adminDb.setProfilingLevel('off', function(err, level) {
                
                // Retrive the profiling information
                adminDb.profilingInfo(function(err, infos) {
                  test.ok(infos.constructor == Array);
                  test.ok(infos.length >= 1);
                  test.ok(infos[0].ts.constructor == Date);
                  test.ok(infos[0].millis.constructor == Number);
                
                  adminDb.removeUser('admin7', function(err, result) {
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
    });
  });
  // DOC_END
}

/**
 * An example of how to use the validateCollection command
 * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
 * 
 * @_class admin
 * @_function validateCollection
 */
exports.shouldCorrectlyCallValidateCollection = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});
  
  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Grab a collection object
    var collection = db.collection('test');
      
    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(err, doc) {
      
      // Use the admin database for the operation
      var adminDb = db.admin();
        
      // Add the new user to the admin database
      adminDb.addUser('admin8', 'admin8', function(err, result) {
        
        // Authenticate using the newly added user
        adminDb.authenticate('admin8', 'admin8', function(err, replies) {
          
          // Validate the 'test' collection
          adminDb.validateCollection('test', function(err, doc) {

            // Pre 1.9.1 servers
            if(doc.result != null) {
              test.ok(doc.result != null);
              test.ok(doc.result.match(/firstExtent/) != null);                    
            } else {
              test.ok(doc.firstExtent != null);
            }

            adminDb.removeUser('admin8', function(err, result) {
              test.ok(result);

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
 * An example of how to add a user to the admin database
 * 
 * @_class admin
 * @_function ping
 */
exports.shouldCorrectlyPingTheMongoDbInstance = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();
      
    // Add the new user to the admin database
    adminDb.addUser('admin9', 'admin9', function(err, result) {
      
      // Authenticate using the newly added user
      adminDb.authenticate('admin9', 'admin9', function(err, result) {
        test.ok(result);
        
        // Ping the server
        adminDb.ping(function(err, pingResult) {
          test.equal(null, err);

          adminDb.removeUser('admin9', function(err, result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * An example of how add a user, authenticate and logout
 * 
 * @_class admin
 * @_function logout
 */
exports.shouldCorrectlyUseLogoutFunction = function(configure, test) {  
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();
      
    // Add the new user to the admin database
    adminDb.addUser('admin10', 'admin10', function(err, result) {
      
      // Authenticate using the newly added user
      adminDb.authenticate('admin10', 'admin10', function(err, result) {
        test.ok(result);
        
        // Logout the user
        adminDb.logout(function(err, result) {
          test.equal(true, result);
          
          adminDb.removeUser('admin10', function(err, result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });                
    });
  });
  // DOC_END
}


/**
 * An example of how to add a user to the admin database
 * 
 * @_class admin
 * @_function addUser
 */
exports.shouldCorrectlyAddAUserToAdminDb = function(configure, test) {  
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();
      
    // Add the new user to the admin database
    adminDb.addUser('admin11', 'admin11', function(err, result) {
      
      // Authenticate using the newly added user
      adminDb.authenticate('admin11', 'admin11', function(err, result) {
        test.ok(result);
        
        adminDb.removeUser('admin11', function(err, result) {
          test.ok(result);

          db.close();
          test.done();
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
exports.shouldCorrectlyAddAUserAndRemoveItFromAdminDb = function(configure, test) {  
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();
      
    // Add the new user to the admin database
    adminDb.addUser('admin12', 'admin12', function(err, result) {
      
      // Authenticate using the newly added user
      adminDb.authenticate('admin12', 'admin12', function(err, result) {
        test.ok(result);
        
        // Remove the user
        adminDb.removeUser('admin12', function(err, result) {              
          test.equal(null, err);
          test.equal(true, result);
          
          // Authenticate using the removed user should fail
          adminDb.authenticate('admin12', 'admin12', function(err, result) {
            test.ok(err != null);
            test.ok(!result);

            db.close();
            test.done();
          });
        })            
      });                
    });
  });
  // DOC_END
}

/**
 * An example of listing all available databases.
 * 
 * @_class admin
 * @_function listDatabases
 */
exports.shouldCorrectlyListAllAvailableDatabases = function(configure, test) {  
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Use the admin database for the operation
    var adminDb = db.admin();
      
    // List all the available databases
    adminDb.listDatabases(function(err, dbs) {
      test.equal(null, err);
      test.ok(dbs.databases.length > 0);
      
      db.close();
      test.done();
    });
  });
  // DOC_END
}

/**
 * Retrieve the current server Info
 *
 * @_class admin
 * @_function serverStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveServerInfo = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(err, doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin13', 'admin13', function(err, result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin13', 'admin13', function(err, result) {
         
          // Retrive the server Info
          adminDb.serverStatus(function(err, info) {
            test.equal(null, err);
            test.ok(info != null);
           
            adminDb.removeUser('admin13', function(err, result) {
              test.ok(result);

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

/**
 * Retrieve the current replicaset status if the server is running as part of a replicaset
 *
 * @_class admin
 * @_function replSetGetStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveReplSetGetStatus = function(configure, test) {
  var db = configure.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {

    // Grab a collection object
    var collection = db.collection('test');

    // Force the creation of the collection by inserting a document
    // Collections are not created until the first document is inserted
    collection.insert({'a':1}, {w: 1}, function(err, doc) {

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin14', 'admin14', function(err, result) {
        test.equal(null, err);
        test.ok(result != null);

        // Authenticate using the newly added user
        adminDb.authenticate('admin14', 'admin14', function(err, result) {
          test.equal(null, err); 
          test.equal(true, result);
         
          // Retrive the server Info, returns error if we are not
          // running a replicaset
          adminDb.replSetGetStatus(function(err, info) {

            adminDb.removeUser('admin14', function(err, result) {
              test.equal(null, err);
              test.ok(result);

              db.close();
              test.done();
            });
          })
        });
      });
    });
  });
  // DOC_END
}