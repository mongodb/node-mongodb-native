var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

/*!
 * Module dependencies.
 */
var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = this;  
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length - 2)) {
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
  // Drop the database and close it
  if(numberOfTestsRun <= 0) {
    // client.dropDatabase(function(err, done) {
      client.close();
      callback();
    // });
  } else {
    client.close();
    callback();
  }
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
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlySetDefaultProfilingLevel = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      fs_client.collection('test', function(err, collection) {
        collection.insert({'a':1}, {safe:true}, function(err, doc) {
          fs_client.admin(function(err, adminDb) {
            adminDb.addUser('admin', 'admin', function(err, result) {
              adminDb.authenticate('admin', 'admin', function(err, replies) {
                adminDb.profilingLevel(function(err, level) {
                  test.equal("off", level);                

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
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlyChangeProfilingLevel = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      fs_client.collection('test', function(err, collection) {
        collection.insert({'a':1}, {safe:true}, function(err, doc) {
          fs_client.admin(function(err, adminDb) {
            adminDb.authenticate('admin', 'admin', function(err, replies) {                                
              adminDb.setProfilingLevel('slow_only', function(err, level) {
                adminDb.profilingLevel(function(err, level) {
                  test.equal('slow_only', level);

                  adminDb.setProfilingLevel('off', function(err, level) {
                    adminDb.profilingLevel(function(err, level) {
                      test.equal('off', level);

                      adminDb.setProfilingLevel('all', function(err, level) {
                        adminDb.profilingLevel(function(err, level) {
                          test.equal('all', level);

                          adminDb.setProfilingLevel('medium', function(err, level) {
                            test.ok(err instanceof Error);
                            test.equal("Error: illegal profiling level value medium", err.message);
                            
                            fs_client.close();
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
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlySetAndExtractProfilingInfo = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      fs_client.collection('test', function(err, collection) {
        collection.insert({'a':1}, {safe:true}, function(doc) {
          fs_client.admin(function(err, adminDb) {
            adminDb.authenticate('admin', 'admin', function(err, replies) {
              adminDb.setProfilingLevel('all', function(err, level) {
                collection.find(function(err, cursor) {
                  cursor.toArray(function(err, items) {
                    adminDb.setProfilingLevel('off', function(err, level) {
                      adminDb.profilingInfo(function(err, infos) {
                        test.ok(infos.constructor == Array);
                        test.ok(infos.length >= 1);
                        test.ok(infos[0].ts.constructor == Date);
                        test.ok(infos[0].millis.constructor == Number);
                        
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
      });
    });
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 * @_class admin
 * @_function validateCollection
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

// /**
//  * Retrieve the server information for the current
//  * instance of the db client
//  * 
//  * @ignore
//  */
// exports.noGlobalsLeaked = function(test) {
//   var leaks = gleak.detectNew();
//   test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
//   test.done();
// }

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;