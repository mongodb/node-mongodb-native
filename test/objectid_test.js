var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
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
  // Close connection
  client.close();
  callback();
}

/**
 * @ignore
 */
exports.shouldCorrectlyGenerateObjectID = function(test) {
  var number_of_tests_done = 0;

  client.collection('test_object_id_generation.data', function(err, collection) {
    // Insert test documents (creates collections and test fetch by query)
    collection.insert({name:"Fred", age:42}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne({name:"Fred"}, function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });

    // Insert another test document and collect using ObjectId
    collection.insert({name:"Pat", age:21}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne(ids[0]['_id'], function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });

    // Manually created id
    var objectId = new ObjectID(null);
    // Insert a manually created document with generated oid
    collection.insert({"_id":objectId, name:"Donald", age:95}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      test.equal(objectId.toHexString(), ids[0]['_id'].toHexString());
      // Locate the first document inserted
      collection.findOne(ids[0]['_id'], function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        test.equal(objectId.toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });
  });

  var intervalId = setInterval(function() {
    if(number_of_tests_done == 3) {
      clearInterval(intervalId);
      test.done();
    }
  }, 100);    
}

/**
 * Generate 12 byte binary string representation using a second based timestamp or
 * default value
 *
 * @_class objectid
 * @_function getTimestamp
 * @ignore
 */
exports.shouldCorrectlyGenerate12ByteStringFromTimestamp = function(test) {
  // Get a timestamp in seconds
  var timestamp = Math.floor(new Date().getTime()/1000);
  // Create a date with the timestamp
  var timestampDate = new Date(timestamp*1000);
  
  // Create a new ObjectID with a specific timestamp
  var objectId = new ObjectID(timestamp);
  
  // Get the timestamp and validate correctness
  test.equal(timestampDate.toString(), objectId.getTimestamp().toString());
  test.done();
}

/**
 * Generate a 24 character hex string representation of the ObjectID
 *
 * @_class objectid
 * @_function toHexString
 * @ignore
 */
exports.shouldCorrectlyRetrieve24CharacterHexStringFromToString = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();  
  // Verify that the hex string is 24 characters long
  test.equal(24, objectId.toHexString().length);
  test.done();
}

/**
 * Get and set the generation time for an ObjectID
 *
 * @_class objectid
 * @_function generationTime
 * @ignore
 */
exports.shouldCorrectlyGetAndSetObjectIDUsingGenerationTimeProperty = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();  
  // Get the generation time
  var generationTime = objectId.generationTime;
  // Add 1000 miliseconds to the generation time
  objectId.generationTime = generationTime + 1000;

  // Create a timestamp
  var timestampDate = new Date();
  timestampDate.setTime((generationTime + 1000) * 1000);
  
  // Get the timestamp and validate correctness
  test.equal(timestampDate.toString(), objectId.getTimestamp().toString());
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieve24CharacterHexStringFromToString = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();  
  // Verify that the hex string is 24 characters long
  test.equal(24, objectId.toString().length);
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieve24CharacterHexStringFromToString = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();  
  // Verify that the hex string is 24 characters long
  test.equal(24, objectId.toJSON().length);
  test.done();
}

/**
 * Convert a ObjectID into a hex string representation and then back to an ObjectID
 *
 * @_class objectid
 * @_function ObjectID.createFromHexString
 * @ignore
 */
exports.shouldCorrectlyTransformObjectIDToAndFromHexString = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();
  // Convert the object id to a hex string
  var originalHex = objectId.toHexString();
  // Create a new ObjectID using the createFromHexString function
  var newObjectId = new ObjectID.createFromHexString(originalHex)
  // Convert the new ObjectID back into a hex string using the toHexString function
  var newHex = newObjectId.toHexString();
  // Compare the two hex strings
  test.equal(originalHex, newHex);
  test.done();
}

/**
 * Compare two different ObjectID's using the equals method
 *
 * @_class objectid
 * @_function equals
 * @ignore
 */
exports.shouldCorrectlyTransformObjectIDToAndFromHexString = function(test) {
  // Create a new ObjectID
  var objectId = new ObjectID();
  // Create a new ObjectID Based on the first ObjectID
  var objectId2 = new ObjectID(objectId.id);
  // Create another ObjectID
  var objectId3 = new ObjectID();
  // objectId and objectId2 should be the same
  test.ok(objectId.equals(objectId2));
  // objectId and objectId2 should be different
  test.ok(!objectId.equals(objectId3));
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateOIDNotUsingObjectID = function(test) {
  client.createCollection('test_non_oid_id', function(err, collection) {
    var date = new Date();
    date.setUTCDate(12);
    date.setUTCFullYear(2009);
    date.setUTCMonth(11 - 1);
    date.setUTCHours(12);
    date.setUTCMinutes(0);
    date.setUTCSeconds(30);

    collection.insert({'_id':date}, {safe:true}, function(err, ids) {
      collection.find({'_id':date}, function(err, cursor) {
        cursor.toArray(function(err, items) {
          test.equal(("" + date), ("" + items[0]._id));

          // Let's close the db
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyGenerateObjectIDFromTimestamp = function(test) {
  var timestamp = Math.floor(new Date().getTime()/1000);
  var objectID = new ObjectID(timestamp);
  var time2 = objectID.generationTime;
  test.equal(timestamp, time2);
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateAnObjectIDAndOverrideTheTimestamp = function(test) {
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

/**
 * @ignore
 */
exports.shouldCorrectlyInsertWithObjectId = function(test) {
  client.createCollection('shouldCorrectlyInsertWithObjectId', function(err, collection) {
    collection.insert({}, {safe:true}, function(err, ids) {
      setTimeout(function() {
        collection.insert({}, {safe:true}, function(err, ids) {
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
            test.done();
          });
        });
      }, 2000);        
    });
  });    
}

/**
 * Show the usage of the Objectid createFromTime function
 *
 * @_class objectid
 * @_function ObjectID.createFromTime
 * @ignore
 */
exports.shouldCorrectlyTransformObjectIDToAndFromHexString = function(test) {
  var objectId = ObjectID.createFromTime(1);
  test.equal("000000010000000000000000", objectId.toHexString());
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;