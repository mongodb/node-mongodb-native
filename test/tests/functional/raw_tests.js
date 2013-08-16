/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentsAndReturnAsRaw = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
        // You have to pass at least query + fields before passing options
        collection.find({}, null, {raw:true}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(Buffer.isBuffer(items[i]));
            objects.push(db.bson.deserialize(items[i]));
          }
          
          test.equal(1, objects[0].a);
          test.equal(2000, objects[1].b);
          test.equal(2.3, objects[2].c);
          
          // Execute findOne
          collection.findOne({a:1}, {raw:true}, function(err, item) {
            test.ok(Buffer.isBuffer(item));
            var object = db.bson.deserialize(item);
            test.equal(1, object.a)            
            db.close();
            test.done();
          })          
        })        
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyRemoveDocumentAndReturnRaw = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyRemoveDocumentAndReturnRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
        // Let's create a raw delete command
        var queryObject = {b:2000};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(db.bson.calculateObjectSize(queryObject));
        db.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    

        // Update the document and return the raw new document
        collection.remove(rawQueryObject, {w:1}, function(err, numberOfDeleted) {
          test.equal(1, numberOfDeleted);
          
          collection.findOne({b:2000}, function(err, item) {
            test.equal(null, item)
            db.close();
            test.done();
          });          
        });        
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateDocumentAndReturnRaw = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyUpdateDocumentAndReturnRaw', function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
        // Let's create a raw delete command
        var selectorObject = {b:2000};
        // Create raw bson buffer
        var rawSelectorObject = new Buffer(db.bson.calculateObjectSize(selectorObject));
        db.bson.serializeWithBufferAndIndex(selectorObject, false, rawSelectorObject, 0);    
        // Let's create a raw delete command
        var updateObject = {"$set":{c:2}};
        // Create raw bson buffer
        var rawUpdateObject = new Buffer(db.bson.calculateObjectSize(updateObject));
        db.bson.serializeWithBufferAndIndex(updateObject, false, rawUpdateObject, 0);    
        // Update the document and return the raw new document
        collection.update(rawSelectorObject, rawUpdateObject, {w:1}, function(err, numberOfUpdated) {
          test.equal(1, numberOfUpdated);
          
          // Query the document
          collection.find({}, {}, {raw:true}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(Buffer.isBuffer(items[i]));
              objects.push(db.bson.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2.3, objects[1].c);
            test.equal(2000, objects[2].b);
            test.equal(2, objects[2].c);
            db.close();
            test.done();
          })
        });        
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorreclyInsertRawDocumentAndRetrieveThem = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorreclyInsertRawDocumentAndRetrieveThem', function(err, collection) {
      // Create serialized insert objects
      var id = new ObjectID();
      var inputObjects = [{_id:id}, {a:1}, {b:2}, {c:4}]
      var serializedObjects = [];
      
      // Serialize all object
      for(var i = 0; i < inputObjects.length; i++) {
        // Create raw bson buffer
        var rawObject = new Buffer(db.bson.calculateObjectSize(inputObjects[i]));
        db.bson.serializeWithBufferAndIndex(inputObjects[i], false, rawObject, 0);
        serializedObjects.push(rawObject);
      }
      
      // Insert all raw objects
      collection.insert(serializedObjects, {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Query the document
        collection.find({}, {}, {raw:true}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(Buffer.isBuffer(items[i]));
            objects.push(db.bson.deserialize(items[i]));
          }

          test.equal(id.toHexString(), objects[0]._id.toHexString());
          test.equal(1, objects[1].a);
          test.equal(2, objects[2].b);
          test.equal(4, objects[3].c);
          db.close();
          test.done();
        })
      });      
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPeformQueryUsingRaw = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyPeformQueryUsingRaw', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Let's create a raw query object
        var queryObject = {b:3};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(db.bson.calculateObjectSize(queryObject));
        db.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    

        // Let's create a raw fields object
        var fieldsObject = {};
        // Create raw bson buffer
        var rawFieldsObject = new Buffer(db.bson.calculateObjectSize(fieldsObject));
        db.bson.serializeWithBufferAndIndex(fieldsObject, false, rawFieldsObject, 0);    

        collection.find(rawQueryObject, rawFieldsObject, {raw:true}).toArray(function(err, items) {
          test.equal(1, items.length);
          test.ok(items[0] instanceof Buffer);
          if(items[0] == null) console.dir(items)
          var object = db.bson.deserialize(items[0]);
          test.equal(3, object.b)            

          collection.findOne(rawQueryObject, rawFieldsObject, {raw:true}, function(err, item) {
            test.equal(null, err);
            test.ok(item != null);
            var object = db.bson.deserialize(item);
            test.equal(3, object.b);
            db.close();
            test.done();
          });
        });
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyThrowErrorsWhenIllegalySizedMessages = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyThrowErrorsWhenIllegalySizedMessages', function(err, collection) {
      var illegalBuffer = new Buffer(20);
      try {
        collection.insert(illegalBuffer, {w:1}, function(err, result) {});        
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
        collection.findOne(illegalBuffer, function() {})
      } catch(err) {      
        test.ok(err.toString().indexOf("query selector") != -1);
      }              

      try {
        collection.findOne({}, illegalBuffer, function() {})
      } catch(err) {
        test.ok(err.toString().indexOf("query fields") != -1);
        db.close();
        test.done();
      }              
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPeformQueryUsingRawSettingRawAtCollectionLevel = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyPeformQueryUsingRawSettingRawAtCollectionLevel', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Let's create a raw query object
        var queryObject = {b:3};
        // Create raw bson buffer
        var rawQueryObject = new Buffer(db.bson.calculateObjectSize(queryObject));
        db.bson.serializeWithBufferAndIndex(queryObject, false, rawQueryObject, 0);    

        // Let's create a raw fields object
        var fieldsObject = {};
        // Create raw bson buffer
        var rawFieldsObject = new Buffer(db.bson.calculateObjectSize(fieldsObject));
        db.bson.serializeWithBufferAndIndex(fieldsObject, false, rawFieldsObject, 0);    

        db.collection('shouldCorrectlyPeformQueryUsingRawSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
          collection.find(rawQueryObject, rawFieldsObject).toArray(function(err, items) {
            test.equal(1, items.length);
            test.ok(items[0] instanceof Buffer);
            var object = db.bson.deserialize(items[0]);
            test.equal(3, object.b)            

            collection.findOne(rawQueryObject, rawFieldsObject, {raw:true}, function(err, item) {
              test.equal(null, err);
              test.ok(item != null);
              var object = db.bson.deserialize(item);
              test.equal(3, object.b)    
              db.close();                    
              test.done();
            });
          });          
        });  
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
      // Create serialized insert objects
      var id = new ObjectID();
      var inputObjects = [{_id:id}, {a:1}, {b:2}, {c:4}]
      var serializedObjects = [];
      
      // Serialize all object
      for(var i = 0; i < inputObjects.length; i++) {
        // Create raw bson buffer
        var rawObject = new Buffer(db.bson.calculateObjectSize(inputObjects[i]));
        db.bson.serializeWithBufferAndIndex(inputObjects[i], false, rawObject, 0);
        serializedObjects.push(rawObject);
      }
      
      // Insert all raw objects
      collection.insert(serializedObjects, {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Query the document
        collection.find({}, {}).toArray(function(err, items) {
          var objects = [];
          for(var i = 0; i < items.length; i++) {
            test.ok(Buffer.isBuffer(items[i]));
            objects.push(db.bson.deserialize(items[i]));
          }

          test.equal(id.toHexString(), objects[0]._id.toHexString());
          test.equal(1, objects[1].a);
          test.equal(2, objects[2].b);
          test.equal(4, objects[3].c);
          db.close();
          test.done();
        })
      });      
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateDocumentAndReturnRawSettingRawAtCollectionLevel = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyUpdateDocumentAndReturnRawSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
      // Insert some documents
      collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
        // Let's create a raw delete command
        var selectorObject = {b:2000};
        // Create raw bson buffer
        var rawSelectorObject = new Buffer(db.bson.calculateObjectSize(selectorObject));
        db.bson.serializeWithBufferAndIndex(selectorObject, false, rawSelectorObject, 0);    
        // Let's create a raw delete command
        var updateObject = {"$set":{c:2}};
        // Create raw bson buffer
        var rawUpdateObject = new Buffer(db.bson.calculateObjectSize(updateObject));
        db.bson.serializeWithBufferAndIndex(updateObject, false, rawUpdateObject, 0);    
        // Update the document and return the raw new document
        collection.update(rawSelectorObject, rawUpdateObject, {w:1}, function(err, numberOfUpdated) {
          test.equal(1, numberOfUpdated);
          
          // Query the document
          collection.find({}, {}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(Buffer.isBuffer(items[i]));
              objects.push(db.bson.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2.3, objects[1].c);
            test.equal(2000, objects[2].b);
            test.equal(2, objects[2].c);
            db.close();
            test.done();
          })
        });        
      });
    });
  });
}