var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  nodeunit = require('nodeunit'),
  Db = require('../lib/mongodb').Db,
  Server = require('../lib/mongodb').Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      // Save reference to db
      client = db_p;
      // Start tests
      callback();
    });
  },
  
  tearDown: function(callback) {
    numberOfTestsRun = numberOfTestsRun - 1;
    // Drop the database and close it
    if(numberOfTestsRun <= 0) {
      client.dropDatabase(function(err, done) {
        client.close();
        callback();
      });        
    } else {
      client.close();
      callback();        
    }      
  },

  shouldCorrectlyCallValidateCollection : function(test) {
    var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        fs_client.collection('test', function(err, collection) {
          collection.insert({'a':1}, function(err, doc) {
            fs_client.admin(function(err, adminDb) {
              adminDb.validateCollection('test', function(err, doc) {
                test.ok(doc.result != null);
                test.ok(doc.result.match(/firstExtent/) != null);
  
                fs_client.close();
                test.done();
              });
            });
          });
        });
      });
    });
  },
  
  shouldCorrectlySetDefaultProfilingLevel : function(test) {
    var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        fs_client.collection('test', function(err, collection) {
          collection.insert({'a':1}, function(err, doc) {
            fs_client.admin(function(err, adminDb) {
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
  },
  
  shouldCorrectlyChangeProfilingLevel : function(test) {
    var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        fs_client.collection('test', function(err, collection) {
          collection.insert({'a':1}, function(err, doc) {
            fs_client.admin(function(err, adminDb) {
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
  },
  
  shouldCorrectlySetAndExtractProfilingInfo : function(test) {
    var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        fs_client.collection('test', function(err, collection) {
          collection.insert({'a':1}, function(doc) {
            fs_client.admin(function(err, adminDb) {
              adminDb.setProfilingLevel('all', function(err, level) {
                collection.find(function(err, cursor) {
                  cursor.toArray(function(err, items) {
                    adminDb.setProfilingLevel('off', function(err, level) {
                      adminDb.profilingInfo(function(err, infos) {
                        test.ok(infos.constructor == Array);
                        test.ok(infos.length >= 1);
                        test.ok(infos[0].ts.constructor == Date);
                        test.ok(infos[0].info.constructor == String);
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
  },  
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;