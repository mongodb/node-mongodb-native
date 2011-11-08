var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

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

  shouldCorrectlySaveDocumentsAndReturnAsRaw : function(test) {
    client.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {safe:true}, function(err, result) {
        // You have to pass at least query + fields before passing options
        collection.find({}, null, {raw:true}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(items[i] instanceof Buffer);
            objects.push(client.bson_deserializer.BSON.deserialize(items[i]));
          }
          
          test.equal(1, objects[0].a);
          test.equal(2000, objects[1].b);
          test.equal(2.3, objects[2].c);
          
          // Execute findOne
          collection.findOne({a:1}, {raw:true}, function(err, item) {
            test.ok(item instanceof Buffer);
            var object = client.bson_deserializer.BSON.deserialize(item);
            test.equal(1, object.a)            
            test.done();
          })          
        })        
      })
    });
  },
  
  shouldCorrectlyRemoveDocumentAndReturnRaw : function(test) {
    client.createCollection('shouldCorrectlyRemoveDocumentAndReturnRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {safe:true}, function(err, result) {
        // Let's create a raw delete command
        var queryObject = {b:2000};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(client.bson_deserializer.BSON.calculateObjectSize(queryObject));
        client.bson_deserializer.BSON.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    

        // Update the document and return the raw new document
        collection.remove(rawQueryObject, {safe:true}, function(err, numberOfDeleted) {
          test.equal(1, numberOfDeleted);
          
          collection.findOne({b:2000}, function(err, item) {
            test.equal(null, item)
            test.done();
          });          
        });        
      });
    });
  },  

  // shouldCorrectlyUpdateDocumentAndReturnRaw : function(test) {
  //   client.createCollection('shouldCorrectlyUpdateDocumentAndReturnRaw', function(err, collection) {
  //     // Insert some documents
  //     collection.insert([{a:1}, {b:2000}, {c:2.3}], {safe:true}, function(err, result) {
  //       // Let's create a raw delete command
  //       var selectorObject = {b:2000};
  //       // Create raw bson buffer
  //       var rawSelectorObject = new Buffer(client.bson_deserializer.BSON.calculateObjectSize(selectorObject));
  //       client.bson_deserializer.BSON.serializeWithBufferAndIndex(queryObject, false, rawSelectorObject, 0);    
  // 
  //       // Let's create a raw delete command
  //       var updateObject = {"$set":{c:2}};
  //       // Create raw bson buffer
  //       var rawUpdateObject = new Buffer(client.bson_deserializer.BSON.calculateObjectSize(updateObject));
  //       client.bson_deserializer.BSON.serializeWithBufferAndIndex(queryObject, false, rawUpdateObject, 0);    
  //       
  //       // Update the document and return the raw new document
  //       collection.update({b:2000}, rawQueryObject, {safe:true}, function(err, numberOfUpdated) {
  //         console.log("------------------------------------------------------------------------------")
  //         console.dir(err)
  //         console.dir(numberOfUpdated)
  //         
  //         test.done();
  //       });        
  //     });
  //   });
  // },  

  // noGlobalsLeaked : function(test) {
  //   var leaks = gleak.detectNew();
  //   test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  //   test.done();
  // }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
