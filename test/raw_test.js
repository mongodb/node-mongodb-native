var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

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
            objects.push(client.bson.deserialize(items[i]));
          }
          
          test.equal(1, objects[0].a);
          test.equal(2000, objects[1].b);
          test.equal(2.3, objects[2].c);
          
          // Execute findOne
          collection.findOne({a:1}, {raw:true}, function(err, item) {
            test.ok(item instanceof Buffer);
            var object = client.bson.deserialize(item);
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
        var rawQueryObject = new Buffer(client.bson.calculateObjectSize(queryObject));
        client.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    
  
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
  
  shouldCorrectlyUpdateDocumentAndReturnRaw : function(test) {
    client.createCollection('shouldCorrectlyUpdateDocumentAndReturnRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {safe:true}, function(err, result) {
        // Let's create a raw delete command
        var selectorObject = {b:2000};
        // Create raw bson buffer
        var rawSelectorObject = new Buffer(client.bson.calculateObjectSize(selectorObject));
        client.bson.serializeWithBufferAndIndex(selectorObject, false, rawSelectorObject, 0);    
        // Let's create a raw delete command
        var updateObject = {"$set":{c:2}};
        // Create raw bson buffer
        var rawUpdateObject = new Buffer(client.bson.calculateObjectSize(updateObject));
        client.bson.serializeWithBufferAndIndex(updateObject, false, rawUpdateObject, 0);    
        // Update the document and return the raw new document
        collection.update(rawSelectorObject, rawUpdateObject, {safe:true}, function(err, numberOfUpdated) {
          test.equal(1, numberOfUpdated);
          
          // Query the document
          collection.find({}, {}, {raw:true}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(items[i] instanceof Buffer);
              objects.push(client.bson.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2.3, objects[1].c);
            test.equal(2000, objects[2].b);
            test.equal(2, objects[2].c);
            test.done();
          })
        });        
      });
    });
  },
  
  shouldCorreclyInsertRawDocumentAndRetrieveThem : function(test) {
    client.createCollection('shouldCorreclyInsertRawDocumentAndRetrieveThem', function(err, collection) {
      // Create serialized insert objects
      var id = new ObjectID();
      var inputObjects = [{_id:id}, {a:1}, {b:2}, {c:4}]
      var serializedObjects = [];
      
      // Serialize all object
      for(var i = 0; i < inputObjects.length; i++) {
        // Create raw bson buffer
        var rawObject = new Buffer(client.bson.calculateObjectSize(inputObjects[i]));
        client.bson.serializeWithBufferAndIndex(inputObjects[i], false, rawObject, 0);
        serializedObjects.push(rawObject);
      }
      
      // Insert all raw objects
      collection.insert(serializedObjects, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Query the document
        collection.find({}, {}, {raw:true}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(items[i] instanceof Buffer);
            objects.push(client.bson.deserialize(items[i]));
          }
  
          test.equal(id.toHexString(), objects[0]._id.toHexString());
          test.equal(1, objects[1].a);
          test.equal(2, objects[2].b);
          test.equal(4, objects[3].c);
          test.done();
        })
      });      
    });
  },
  
  shouldCorrectlyPeformQueryUsingRaw : function(test) {
    client.createCollection('shouldCorrectlyPeformQueryUsingRaw', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {b:3}], {safe:true}, function(err, result) {
        test.equal(null, err);
  
        // Let's create a raw query object
        var queryObject = {b:3};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(client.bson.calculateObjectSize(queryObject));
        client.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    
  
        // Let's create a raw fields object
        var fieldsObject = {};
        // Create raw bson buffer
        var rawFieldsObject = new Buffer(client.bson.calculateObjectSize(fieldsObject));
        client.bson.serializeWithBufferAndIndex(fieldsObject, false, rawFieldsObject, 0);    

        collection.find(rawQueryObject, rawFieldsObject, {raw:true}).toArray(function(err, items) {
          test.equal(1, items.length);
          test.ok(items[0] instanceof Buffer);
          if(items[0] == null) console.dir(items)
          var object = client.bson.deserialize(items[0]);
          test.equal(3, object.b)            
  
          collection.findOne(rawQueryObject, rawFieldsObject, {raw:true}, function(err, item) {
            test.equal(null, err);
            test.ok(item != null);
            var object = client.bson.deserialize(item);
            test.equal(3, object.b)                        
            test.done();
          });
        });
      })
    });
  },
  
  shouldCorrectlyThrowErrorsWhenIllegalySizedMessages : function(test) {
    client.createCollection('shouldCorrectlyThrowErrorsWhenIllegalySizedMessages', function(err, collection) {
      var illegalBuffer = new Buffer(20);
      try {
        collection.insert(illegalBuffer, {safe:true}, function(err, result) {});        
      } catch (err) {
        test.ok(err.toString().indexOf("insert") != -1);        
      }
      
      try {
        collection.update(illegalBuffer, {}, function(){})          
      } catch(err) {
        test.ok(err.toString().indexOf("update spec") != -1);
      }        
  
      try {
        collection.update({}, illegalBuffer, function(){})          
      } catch(err) {
        test.ok(err.toString().indexOf("update document") != -1);
      }              
  
      try {
        collection.remove(illegalBuffer, function(){})          
      } catch(err) {
        test.ok(err.toString().indexOf("delete") != -1);
      }              
  
      try {
        collection.find(illegalBuffer).toArray(function() {})
      } catch(err) {
        test.ok(err.toString().indexOf("query selector") != -1);
      }              
  
      try {
        collection.find({}, illegalBuffer).toArray(function() {})
      } catch(err) {
        test.ok(err.toString().indexOf("query fields") != -1);
      }              
  
      try {
        collection.findOne(illegalBuffer).toArray(function() {})
      } catch(err) {
        test.ok(err.toString().indexOf("query selector") != -1);
      }              
  
      try {
        collection.findOne({}, illegalBuffer).toArray(function() {})
      } catch(err) {
        test.ok(err.toString().indexOf("query fields") != -1);
        test.done();
      }              
    });
  },
  
  shouldCorrectlyPeformQueryUsingRawSettingRawAtCollectionLevel : function(test) {
    client.createCollection('shouldCorrectlyPeformQueryUsingRawSettingRawAtCollectionLevel', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {b:3}], {safe:true}, function(err, result) {
        test.equal(null, err);
  
        // Let's create a raw query object
        var queryObject = {b:3};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(client.bson.calculateObjectSize(queryObject));
        client.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    
  
        // Let's create a raw fields object
        var fieldsObject = {};
        // Create raw bson buffer
        var rawFieldsObject = new Buffer(client.bson.calculateObjectSize(fieldsObject));
        client.bson.serializeWithBufferAndIndex(fieldsObject, false, rawFieldsObject, 0);    
  
        client.collection('shouldCorrectlyPeformQueryUsingRaw', {raw:true}, function(err, collection) {
          collection.find(rawQueryObject, rawFieldsObject).toArray(function(err, items) {
            test.equal(1, items.length);
            test.ok(items[0] instanceof Buffer);
            var object = client.bson.deserialize(items[0]);
            test.equal(3, object.b)            

            collection.findOne(rawQueryObject, rawFieldsObject, {raw:true}, function(err, item) {
              test.equal(null, err);
              test.ok(item != null);
              var object = client.bson.deserialize(item);
              test.equal(3, object.b)                        
              test.done();
            });
          });          
        });  
      })
    });
  },
  
  shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel : function(test) {
    client.createCollection('shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
      // Create serialized insert objects
      var id = new ObjectID();
      var inputObjects = [{_id:id}, {a:1}, {b:2}, {c:4}]
      var serializedObjects = [];
      
      // Serialize all object
      for(var i = 0; i < inputObjects.length; i++) {
        // Create raw bson buffer
        var rawObject = new Buffer(client.bson.calculateObjectSize(inputObjects[i]));
        client.bson.serializeWithBufferAndIndex(inputObjects[i], false, rawObject, 0);
        serializedObjects.push(rawObject);
      }
      
      // Insert all raw objects
      collection.insert(serializedObjects, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Query the document
        collection.find({}, {}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(items[i] instanceof Buffer);
            objects.push(client.bson.deserialize(items[i]));
          }
  
          test.equal(id.toHexString(), objects[0]._id.toHexString());
          test.equal(1, objects[1].a);
          test.equal(2, objects[2].b);
          test.equal(4, objects[3].c);
          test.done();
        })
      });      
    });
  },
  
  shouldCorrectlyUpdateDocumentAndReturnRawSettingRawAtCollectionLevel : function(test) {
    client.createCollection('shouldCorrectlyUpdateDocumentAndReturnRawSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {safe:true}, function(err, result) {
        // Let's create a raw delete command
        var selectorObject = {b:2000};
        // Create raw bson buffer
        var rawSelectorObject = new Buffer(client.bson.calculateObjectSize(selectorObject));
        client.bson.serializeWithBufferAndIndex(selectorObject, false, rawSelectorObject, 0);    
        // Let's create a raw delete command
        var updateObject = {"$set":{c:2}};
        // Create raw bson buffer
        var rawUpdateObject = new Buffer(client.bson.calculateObjectSize(updateObject));
        client.bson.serializeWithBufferAndIndex(updateObject, false, rawUpdateObject, 0);    
        // Update the document and return the raw new document
        collection.update(rawSelectorObject, rawUpdateObject, {safe:true}, function(err, numberOfUpdated) {
          test.equal(1, numberOfUpdated);
          
          // Query the document
          collection.find({}, {}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(items[i] instanceof Buffer);
              objects.push(client.bson.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2.3, objects[1].c);
            test.equal(2000, objects[2].b);
            test.equal(2, objects[2].c);
            test.done();
          })
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
