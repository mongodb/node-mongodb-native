"use strict";

var f = require('util').format;

exports['should allow bypassing document validation in 3.2 or higher on inserts'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      // Get collection
      var col = db.collection('createValidationCollection');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollection', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Ensure validation was correctly applied
          col.insert({b:1}, function(err) {
            test.ok(err != null);

            // Ensure validation was correctly applied
            col.insert({b:1}, {bypassDocumentValidation:true}, function(err) {
              test.equal(null, err);

              // Bypass valiation on insert
              col.insertOne({b:1}, {bypassDocumentValidation:true}, function(err, r) {
                test.equal(null, err);

                // Bypass valiation on insert
                col.insertMany([{b:1}], {bypassDocumentValidation:true}, function(err, r) {
                  test.equal(null, err);

                  client.close();
                  test.done();
                });
              });
            });
          });
        });
      });      
    });
  }
}

exports['should allow bypassing document validation in 3.2 or higher on updates'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      // Get collection
      var col = db.collection('createValidationCollection');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollection', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Should fail
          col.update({b:1}, {$set: {b:1}}, {upsert:true}, function(err) {
            test.ok(err != null);

            // Ensure validation was correctly applied
            col.update({b:1}, {$set: {b:1}}, {upsert:true, bypassDocumentValidation:true}, function(err) {
              test.equal(null, err);

              // updateOne
              col.updateOne({c:1}, {$set: {c:1}}, {upsert:true, bypassDocumentValidation:true}, function(err, r) {
                test.equal(null, err);

                // updateMany
                col.updateMany({d:1}, {$set: {d:1}}, {upsert:true, bypassDocumentValidation:true}, function(err, r) {
                  test.equal(null, err);

                  // updateMany
                  col.replaceOne({e:1}, {$set: {e:1}}, {upsert:true, bypassDocumentValidation:true}, function(err, r) {
                    test.equal(null, err);

                    client.close();
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
}

exports['should allow bypassing document validation in 3.2 or higher on bulkWrite'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      // Get collection
      var col = db.collection('createValidationCollection');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollection', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Should fail
          col.bulkWrite([
              { insertOne: { b: 1 } }
            ], function(err) {
            test.ok(err != null);

            col.bulkWrite([
                { insertOne: { b: 1 } }
              ], {bypassDocumentValidation:true}, function(err) {
                test.equal(null, err);

                client.close();
                test.done();
            });
          });
        });
      });      
    });
  }
}

exports['should allow bypassing document validation in 3.2 or higher on findAndModify'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      // Get collection
      var col = db.collection('createValidationCollection');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollection', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Should fail
          col.findOneAndUpdate({b:1}, {$set: {b:1}}, {upsert:true}, function(err, r) {
            test.ok(err != null);

            // Should pass
            col.findOneAndUpdate({b:1}, {$set: {b:1}}, {upsert:true, bypassDocumentValidation:true}, function(err, r) {
              test.equal(null, err);

              // Should pass
              col.findOneAndReplace({c:1}, {c:1}, {upsert:true, bypassDocumentValidation:true}, function(err, r) {
                test.equal(null, err);

                client.close();
                test.done();
              });
            });
          });
        });
      });      
    });
  }
}

exports['should correctly bypass validation for aggregation using out'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Get collection
      var col = db.collection('createValidationCollectionOut');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollectionOut', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Insert the docs
          col.insertMany(docs, {w: 1, bypassDocumentValidation:true}, function(err, result) {
            test.equal(null, err);

            // Execute aggregate, notice the pipeline is expressed as an Array
            col.aggregate([
                { $project : {
                  author : 1,
                  tags : 1
                }},
                { $unwind : "$tags" },
                { $group : {
                  _id : {tags : "$tags"},
                  authors : { $addToSet : "$author" }
                }}, {$out: 'createValidationCollectionOut'}
              ], {bypassDocumentValidation:true}, function(err, result) {
                test.equal(null, err);

                client.close();
                test.done();
            });
          });
        });
      });
    });
  }
}

exports['should correctly bypass validation for mapReduce using out'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">=3.1.7", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Get collection
      var col = db.collection('createValidationCollectionOut');

      // Drop the collection
      col.drop(function() {

        // Create a collection with a validator
        db.createCollection('createValidationCollectionOut', {validator: {a: {$exists:true}}}, function(err, r) {
          test.equal(null, err);

          // Get write concern
          var writeConcern = configuration.writeConcernMax();
          writeConcern.bypassDocumentValidation = true;

          // Insert documents
          col.insertMany([{'user_id':1}, {'user_id':2}], {bypassDocumentValidation:true}, function(err, r) {
            // String functions
            var map = "function() { emit(this.user_id, 1); }";
            var reduce = "function(k,vals) { return 1; }";

            col.mapReduce(map, reduce, {out: {replace : 'createValidationCollectionOut'}, bypassDocumentValidation: true}, function(err, collection) {
              test.equal(null, err);

              client.close();
              test.done();
            });
          });
        });
      });
    });
  }
}
