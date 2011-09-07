var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../tools/gleak'),
  fs = require('fs'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  GridStore = mongodb.GridStore,
  Chunk = mongodb.Chunk,
  Step = require("../../deps/step/lib/step"),
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      if(numberOfTestsRun == Object.keys(tests).length) {
        // If first test drop the db
        client.dropDatabase(function(err, done) {
          callback();
        });                
      } else {
        return callback();        
      }      
    });
  },
  
  tearDown: function(callback) {
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
  },
  
  shouldCorrectlyWriteLargeFileStringAndReadBack : function(test) {
    var db = client;
    var fileId = new client.bson_serializer.ObjectID();
    var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
    gridStore.chunkSize = 5000;
  
    gridStore.open(function(err, gridStore) {
     Step(
       function writeData() {
         var group = this.group();
         var d = '';
         for(var j = 0; j < 5000;j++) {
           d = d + '+';
         }
  
         for(var i = 0; i < 15000; i += 5000) {
           gridStore.write(d, false, group());
         }   
       },
  
       function readAsStream() {
         gridStore.close(function(err, result) {
           var gotEnd = false;           
           var endLen = 0;
  
           var gridStore = new GridStore(db, fileId, "r");
           gridStore.open(function(err, gridStore) {
             var stream = gridStore.stream(true);
  
             stream.on("data", function(chunk) {
               endLen += chunk.length
               // Test length of chunk
               test.equal(5000, chunk.length);
               // Check each chunk's data
               for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
             });
  
             stream.on("end", function() {
               gotEnd = true;
             });
  
             stream.on("close", function() {
               test.equal(15000, endLen);
               test.equal(true, gotEnd);
               test.done();
             });
           });           
         });
       }
     )
    });    
  },

  shouldCorrectlyWriteLargeFileBufferAndReadBack : function(test) {
    var db = client;
    var fileId = new client.bson_serializer.ObjectID();
    var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
    gridStore.chunkSize = 5000;

    gridStore.open(function(err, gridStore) {
      Step(
        function writeData() {
          var group = this.group();
          var d = new Buffer(5000);
          for(var j = 0; j < 5000;j++) {
            d[j] = 43;
          }         

          for(var i = 0; i < 15000; i += 5000) {
            gridStore.write(d, false, group());
          }   
        },

        function readAsStream() {
          gridStore.close(function(err, result) {
           var gotEnd = false;           
           var endLen = 0;

           var gridStore = new GridStore(db, fileId, "r");
           gridStore.open(function(err, gridStore) {
             var stream = gridStore.stream(true);

             stream.on("data", function(chunk) {
               endLen += chunk.length
               // Test length of chunk
               test.equal(5000, chunk.length);
               // Check each chunk's data
               for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
             });

             stream.on("end", function() {
               gotEnd = true;
             });

             stream.on("close", function() {
               test.equal(15000, endLen);
               test.equal(true, gotEnd);
               test.done();
             });
           });           
          });
        }
      )
    });    
  },

  shouldCorrectlyReadFileUsingStream : function(test) {
    var gridStoreR = new GridStore(client, "test_gs_read_stream", "r");
    var gridStoreW = new GridStore(client, "test_gs_read_stream", "w");
    var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png", 'binary');
  
    var readLen = 0;
    var gotEnd = 0;
  
    gridStoreW.open(function(err, gs) {
      gs.write(data, function(err, gs) {
        gs.close(function(err, result) {
          gridStoreR.open(function(err, gs) {
            var stream = gs.stream(true);
            stream.on("data", function(chunk) {
              readLen += chunk.length;
            });
            stream.on("end", function() {
              ++gotEnd;
            });
            stream.on("close", function() {
              test.equal(data.length, readLen);
              test.equal(1, gotEnd);
              test.done();
            });
          });
        });
      });
    });
  },

  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
