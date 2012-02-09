var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var native_parser = (process.env['TEST_NATIVE'] != null);
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

exports.shouldStreamRecordsCallsDataTheRightNumberOfTimes = function(test) {
  client.createCollection('test_stream_records', function(err, collection) {
    test.ok(collection instanceof Collection);
    collection.insert([{'a':1}, {'b' : 2}, {'c' : 3}, {'d' : 4}, {'e' : 5}], {safe:true}, function(err, ids) {
      var stream = collection.find({}, {'limit' : 3}).streamRecords();
      var callsToEnd = 0;
      stream.on('end', function() { 
        test.done();
      });
      
      var callsToData = 0;
      stream.on('data',function(data){ 
        callsToData += 1;
        test.ok(callsToData <= 3);
      }); 
    });
  });    
}

exports.shouldStreamRecordsCallsEndTheRightNumberOfTimes = function(test) {
  client.createCollection('test_stream_records', function(err, collection) {
    test.ok(collection instanceof Collection);
    collection.insert([{'a':1}, {'b' : 2}, {'c' : 3}, {'d' : 4}, {'e' : 5}], {safe:true}, function(err, ids) {
      collection.find({}, {'limit' : 3}, function(err, cursor) {
        var stream = cursor.streamRecords(function(er,item) {}); 
        var callsToEnd = 0;
        stream.on('end', function() { 
          callsToEnd += 1;
          test.equal(1, callsToEnd);
          setTimeout(function() {
            // Let's close the db
            if (callsToEnd == 1) {
              test.done();
            }
          }.bind(this), 1000);
        });
        
        stream.on('data',function(data){ /* nothing here */ }); 
      });
    });
  });    
}

exports.shouldStreamDocumentsWithLimitForFetching = function(test) {
  var docs = []
  
  for(var i = 0; i < 3000; i++) {
    docs.push({'a':i})
  }

  client.createCollection('test_streaming_function_with_limit_for_fetching', function(err, collection) {
    test.ok(collection instanceof Collection);

    collection.insert(docs, {safe:true}, function(err, ids) {        
      collection.find({}, function(err, cursor) {
        // Execute find on all the documents
        var stream = cursor.streamRecords({fetchSize:1000}); 
        var callsToEnd = 0;
        stream.on('end', function() { 
          test.done();
        });

        var callsToData = 0;
        stream.on('data',function(data){ 
          callsToData += 1;
          test.ok(callsToData <= 3000);
        }); 
      });        
    });
  });    
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