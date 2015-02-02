"use strict";

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentsAndReturnAsRaw = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Buffer = require('buffer').Buffer
      , BSON = configuration.require.pure().BSON;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw', function(err, collection) {
        // Insert some documents
        collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
          // You have to pass at least query + fields before passing options
          collection.find({}, null, {raw:true, batchSize: 2}).toArray(function(err, items) {
            var objects = [];

            for(var i = 0; i < items.length; i++) {
              test.ok(Buffer.isBuffer(items[i]));
              objects.push(BSON.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2000, objects[1].b);
            test.equal(2.3, objects[2].c);
            
            // Execute findOne
            collection.findOne({a:1}, {raw:true}, function(err, item) {
              test.ok(Buffer.isBuffer(item));
              var object = BSON.deserialize(item);
              test.equal(1, object.a)            
              db.close();
              test.done();
            })          
          })        
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentsAndReturnAsRawWithRawSetAtCollectionLevel = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Buffer = require('buffer').Buffer
      , BSON = configuration.require.pure().BSON;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw_2', {raw: true}, function(err, collection) {
        // Insert some documents
        collection.insert([{a:1}, {b:2000}, {c:2.3}], {w:1}, function(err, result) {
          // You have to pass at least query + fields before passing options
          collection.find({}, null, {batchSize: 2}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(Buffer.isBuffer(items[i]));
              objects.push(BSON.deserialize(items[i]));
            }
            
            test.equal(1, objects[0].a);
            test.equal(2000, objects[1].b);
            test.equal(2.3, objects[2].c);
            
            // Execute findOne
            collection.findOne({a:1}, {raw:true}, function(err, item) {
              test.ok(Buffer.isBuffer(item));
              var object = BSON.deserialize(item);
              test.equal(1, object.a)            
              db.close();
              test.done();
            })          
          })        
        })
      });
    });
  }
}