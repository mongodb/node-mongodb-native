"use strict";

/**
 * @ignore
 */
exports.shouldCorrectlyGenerateObjectID = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var number_of_tests_done = 0;

      var collection = db.collection('test_object_id_generation.data');
      // Insert test documents (creates collections and test fetch by query)
      collection.insert({name:"Fred", age:42}, {w:1}, function(err, r) {
        test.equal(1, r.length);
        test.ok(r[0]['_id'].toHexString().length == 24);
        // Locate the first document inserted
        collection.findOne({name:"Fred"}, function(err, document) {
          test.equal(r[0]['_id'].toHexString(), document._id.toHexString());
          number_of_tests_done++;
        });
      });

      // Insert another test document and collect using ObjectId
      collection.insert({name:"Pat", age:21}, {w:1}, function(err, r) {
        test.equal(1, r.length);
        test.ok(r[0]['_id'].toHexString().length == 24);
        // Locate the first document inserted
        collection.findOne(r[0]['_id'], function(err, document) {
          test.equal(r[0]['_id'].toHexString(), document._id.toHexString());
          number_of_tests_done++;
        });
      });

      // Manually created id
      var objectId = new ObjectID(null);
      // Insert a manually created document with generated oid
      collection.insert({"_id":objectId, name:"Donald", age:95}, {w:1}, function(err, r) {
        test.equal(1, r.length);
        test.ok(r[0]['_id'].toHexString().length == 24);
        test.equal(objectId.toHexString(), r[0]['_id'].toHexString());
        // Locate the first document inserted
        collection.findOne(r[0]['_id'], function(err, document) {
          test.equal(r[0]['_id'].toHexString(), document._id.toHexString());
          test.equal(objectId.toHexString(), document._id.toHexString());
          number_of_tests_done++;
        });
      });

      var intervalId = setInterval(function() {
        if(number_of_tests_done == 3) {
          clearInterval(intervalId);
          db.close();
          test.done();
        }
      }, 100);
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieve24CharacterHexStringFromToString = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    // Create a new ObjectID
    var objectId = new ObjectID();  
    // Verify that the hex string is 24 characters long
    test.equal(24, objectId.toString().length);
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieve24CharacterHexStringFromToJSON = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    // Create a new ObjectID
    var objectId = new ObjectID();  
    // Verify that the hex string is 24 characters long
    test.equal(24, objectId.toJSON().length);
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateOIDNotUsingObjectID = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {  
      var collection = db.collection('test_non_oid_id');
      var date = new Date();
      date.setUTCDate(12);
      date.setUTCFullYear(2009);
      date.setUTCMonth(11 - 1);
      date.setUTCHours(12);
      date.setUTCMinutes(0);
      date.setUTCSeconds(30);

      collection.insert({'_id':date}, {w:1}, function(err, ids) {
        collection.find({'_id':date}).toArray(function(err, items) {
          test.equal(("" + date), ("" + items[0]._id));

          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyGenerateObjectIDFromTimestamp = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var timestamp = Math.floor(new Date().getTime()/1000);
    var objectID = new ObjectID(timestamp);
    var time2 = objectID.generationTime;
    test.equal(timestamp, time2);
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateAnObjectIDAndOverrideTheTimestamp = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var timestamp = 1000;
    var objectID = new ObjectID();
    var id1 = objectID.id;
    // Override the timestamp
    objectID.generationTime = timestamp
    var id2 = objectID.id;  
    // Check the strings
    test.equal(id1.substr(4), id2.substr(4));
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertWithObjectId = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyInsertWithObjectId');
      collection.insert({}, {w:1}, function(err, ids) {
        setTimeout(function() {
          collection.insert({}, {w:1}, function(err, ids) {
            collection.find().toArray(function(err, items) {
              var compareDate = new Date();
              
              // Date 1
              var date1 = new Date();
              date1.setTime(items[0]._id.generationTime * 1000);
              // Date 2
              var date2 = new Date();
              date2.setTime(items[1]._id.generationTime * 1000);

              // Compare
              test.equal(compareDate.getFullYear(), date1.getFullYear());
              test.equal(compareDate.getDate(), date1.getDate());
              test.equal(compareDate.getMonth(), date1.getMonth());
              test.equal(compareDate.getHours(), date1.getHours());

              test.equal(compareDate.getFullYear(), date2.getFullYear());
              test.equal(compareDate.getDate(), date2.getDate());
              test.equal(compareDate.getMonth(), date2.getMonth());
              test.equal(compareDate.getHours(), date2.getHours());
              // Let's close the db
              db.close();
              test.done();
            });
          });
        }, 2000);        
      });
    });
  }
}