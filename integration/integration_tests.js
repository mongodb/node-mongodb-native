GLOBAL.DEBUG = true;

debug = require("sys").debug,
inspect = require("sys").inspect;
test = require("assert");
var Db = require('../lib/mongodb').Db,
  GridStore = require('../lib/mongodb').GridStore,
  Chunk = require('../lib/mongodb').Chunk,
  Server = require('../lib/mongodb').Server,
  ServerPair = require('../lib/mongodb').ServerPair,
  ServerCluster = require('../lib/mongodb').ServerCluster,
  Code = require('../lib/mongodb/bson/bson').Code;
  Binary = require('../lib/mongodb/bson/bson').Binary;
  ObjectID = require('../lib/mongodb/bson/bson').ObjectID,
  DBRef = require('../lib/mongodb/bson/bson').DBRef,
  Cursor = require('../lib/mongodb/cursor').Cursor,
  Collection = require('../lib/mongodb/collection').Collection,
  BinaryParser = require('../lib/mongodb/bson/binary_parser').BinaryParser,
  Buffer = require('buffer').Buffer,
  fs = require('fs'),
  Script = require('vm');

/*******************************************************************************************************
  Integration Tests
*******************************************************************************************************/
var all_tests = {
                                        
  // test_kill_cursors : function() {
  //   var test_kill_cursors_client = new Db('integration_tests4_', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {});
  //   test_kill_cursors_client.bson_deserializer = client.bson_deserializer;
  //   test_kill_cursors_client.bson_serializer = client.bson_serializer;
  //   test_kill_cursors_client.pkFactory = client.pkFactory;
  //
  //   test_kill_cursors_client.open(function(err, test_kill_cursors_client) {
  //     var number_of_tests_done = 0;
  //
  //     test_kill_cursors_client.dropCollection('test_kill_cursors', function(err, collection) {
  //       test_kill_cursors_client.createCollection('test_kill_cursors', function(err, collection) {
  //         test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //           var clientCursors = cursorInfo.clientCursors_size;
  //           var byLocation = cursorInfo.byLocation_size;
  //
  //           for(var i = 0; i < 1000; i++) {
  //             collection.save({'i': i}, function(err, doc) {});
  //           }
  //
  //           test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //             test.equal(clientCursors, cursorInfo.clientCursors_size);
  //             test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //             for(var i = 0; i < 10; i++) {
  //               collection.findOne(function(err, item) {});
  //             }
  //
  //             test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //               test.equal(clientCursors, cursorInfo.clientCursors_size);
  //               test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //               for(var i = 0; i < 10; i++) {
  //                 collection.find(function(err, cursor) {
  //                   cursor.nextObject(function(err, item) {
  //                     cursor.close(function(err, cursor) {});
  //
  //                     if(i == 10) {
  //                       test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                         test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                         test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                         collection.find(function(err, cursor) {
  //                           cursor.nextObject(function(err, item) {
  //                             test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                               test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                               test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                               cursor.close(function(err, cursor) {
  //                                 test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                   test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                                   test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                                   collection.find({}, {'limit':10}, function(err, cursor) {
  //                                     cursor.nextObject(function(err, item) {
  //                                       test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                         test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                           sys.puts("===================================== err: " + err)
  //                                           sys.puts("===================================== cursorInfo: " + sys.inspect(cursorInfo))
  //
  //
  //                                           test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                                           test.equal(byLocation, cursorInfo.byLocation_size);
  //                                           number_of_tests_done = 1;
  //                                         });
  //                                       });
  //                                     });
  //                                   });
  //                                 });
  //                               });
  //                             });
  //                           });
  //                         });
  //                       });
  //                     }
  //                   });
  //                 });
  //               }
  //             });
  //           });
  //         });
  //       });
  //     });
  //
  //     var intervalId = setInterval(function() {
  //       if(number_of_tests_done == 1) {
  //         clearInterval(intervalId);
  //         finished_test({test_kill_cursors:'ok'});
  //         test_kill_cursors_client.close();
  //       }
  //     }, 100);
  //   });
  // },
                                        
  // test_force_binary_error : function() {
  //   client.createCollection('test_force_binary_error', function(err, collection) {
  //     // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
  //     // is the error handling of the findOne Method
  //     var result= "";
  //     var hexString = "5e9bd59248305adf18ebc15703a1";
  //     for(var index=0 ; index < hexString.length; index+=2) {
  //         var string= hexString.substr(index, 2);
  //         var number= parseInt(string, 16);
  //         result+= BinaryParser.fromByte(number);
  //     }
  //
  //     // Generate a illegal ID
  //     var id = client.bson_serializer.ObjectID.createFromHexString('5e9bd59248305adf18ebc157');
  //     id.id = result;
  //
  //     // Execute with error
  //     collection.findOne({"_id": id}, function(err, result) {
  //       // test.equal(undefined, result)
  //       test.ok(err != null)
  //       finished_test({test_force_binary_error:'ok'});
  //     });
  //   });
  // },
      
  // test_pair : function() {
  //   var p_client = new Db('integration_tests_21', new ServerPair(new Server("127.0.0.1", 27017, {}), new Server("127.0.0.1", 27018, {})), {});
  //   p_client.open(function(err, p_client) {
  //     p_client.dropDatabase(function(err, done) {
  //       test.ok(p_client.primary != null);
  //       test.equal(2, p_client.connections.length);
  // 
  //       // Check both server running
  //       test.equal(true, p_client.serverConfig.leftServer.connected);
  //       test.equal(true, p_client.serverConfig.rightServer.connected);
  // 
  //       test.ok(p_client.serverConfig.leftServer.master);
  //       test.equal(false, p_client.serverConfig.rightServer.master);
  // 
  //       p_client.createCollection('test_collection', function(err, collection) {
  //         collection.insert({'a':1}, function(err, doc) {
  //           collection.find(function(err, cursor) {
  //             cursor.toArray(function(err, items) {
  //               test.equal(1, items.length);
  // 
  //               finished_test({test_pair:'ok'});
  //               p_client.close();
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });
  // },
  // 
  // test_cluster : function() {
  //   var p_client = new Db('integration_tests_22', new ServerCluster([new Server("127.0.0.1", 27017, {}), new Server("127.0.0.1", 27018, {})]), {});
  //   p_client.open(function(err, p_client) {
  //     p_client.dropDatabase(function(err, done) {
  //       test.ok(p_client.primary != null);
  //       test.equal(2, p_client.connections.length);
  // 
  //       test.equal(true, p_client.serverConfig.servers[0].master);
  //       test.equal(false, p_client.serverConfig.servers[1].master);
  // 
  //       p_client.createCollection('test_collection', function(err, collection) {
  //         collection.insert({'a':1}, function(err, doc) {
  //           collection.find(function(err, cursor) {
  //             cursor.toArray(function(err, items) {
  //               test.equal(1, items.length);
  // 
  //               finished_test({test_cluster:'ok'});
  //               p_client.close();
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });
  // },
  // 
  // test_slave_connection :function() {
  //   var p_client = new Db('integration_tests_23', new Server("127.0.0.1", 27018, {}));
  //   p_client.open(function(err, p_client) {
  //     test.equal(null, err);
  //     finished_test({test_slave_connection:'ok'});
  //     p_client.close();
  //   });
  // },
                    
  // test_long_term_insert : function() {
  //   var numberOfTimes = 21000;
  //   
  //   client.createCollection('test_safe_insert', function(err, collection) {
  //     var timer = setInterval(function() {        
  //       collection.insert({'test': 1}, {safe:true}, function(err, result) {
  //         numberOfTimes = numberOfTimes - 1;
  // 
  //         if(numberOfTimes <= 0) {
  //           clearInterval(timer);
  //           collection.count(function(err, count) {
  //             test.equal(21000, count);
  //             finished_test({test_long_term_insert:'ok'})
  //           });
  //         }          
  //       });
  //     }, 1);      
  //   });
  // },  
};

/*******************************************************************************************************
  Setup For Running Tests
*******************************************************************************************************/
var client_tests = {};
var type = process.argv[2];

if(process.argv[3]){
  var test_arg = process.argv[3];
  if(test_arg == 'all') client_tests = all_tests;
  else {
    test_arg.split(',').forEach(function(aTest){
      if(all_tests[aTest]) client_tests[aTest] = all_tests[aTest];
    });
  }
} else client_tests = all_tests;

var client_tests_keys = [];
for(key in client_tests) client_tests_keys.push(key);

// Set up the client connection
var client = new Db('integration_tests_', new Server("127.0.0.1", 27017, {}), {});
// Use native deserializer
if(type == "native") {
  var BSON = require("../external-libs/bson");
  debug("========= Integration tests running Native BSON Parser == ")
  client.bson_deserializer = BSON;
  client.bson_serializer = BSON;
  client.pkFactory = BSON.ObjectID;
} else {
  var BSONJS = require('../lib/mongodb/bson/bson');
  debug("========= Integration tests running Pure JS BSON Parser == ")
  client.bson_deserializer = BSONJS;
  client.bson_serializer = BSONJS;
  client.pkFactory = BSONJS.ObjectID;
}

client.open(function(err, client) {
  // Do cleanup of the db
  client.dropDatabase(function() {
    // Run  all the tests
    run_tests();
    // Start the timer that checks that all the tests have finished or failed
    ensure_tests_finished();
  });
});

function ensure_tests_finished() {
  var intervalId = setInterval(function() {
    if(client_tests_keys.length == 0) {
      // Print out the result
      debug("= Final Checks =========================================================");
      // Stop interval timer and close db connection
      clearInterval(intervalId);
      // Ensure we don't have any more cursors hanging about
      client.cursorInfo(function(err, cursorInfo) {
        debug(inspect(cursorInfo));
        debug("");
        client.close();
      });
    }
  }, 100);
};

// All the finished client tests
var finished_tests = [];

function run_tests() {
  // Run first test
  client_tests[client_tests_keys[0]]();  
}

function finished_test(test_object) {
  for(var name in test_object) {
    debug("= executing test: " + name + " [" + test_object[name] + "]");
  }
  finished_tests.push(test_object);
  client_tests_keys.shift();
  // Execute next test
  if(client_tests_keys.length > 0) client_tests[client_tests_keys[0]]();
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
