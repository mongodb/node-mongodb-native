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
  
exports.shouldCorrectlyInsertSimpleRegExpDocument = function(test) {
  var regexp = /foobar/i;

  client.createCollection('test_regex', function(err, collection) {
    collection.insert({'b':regexp}, {safe:true}, function(err, ids) {
      collection.find({}, {'fields': ['b']}, function(err, cursor) {
        cursor.toArray(function(err, items) {
          test.equal(("" + regexp), ("" + items[0].b));
          // Let's close the db
          test.done();
        });
      });
    });
  });
}

exports.shouldCorrectlyInsertSimpleUTF8Regexp = function(test) {
  var regexp = /foobaré/;

  client.createCollection('test_utf8_regex', function(err, collection) {
    collection.insert({'b':regexp}, {safe:true}, function(err, ids) {
      collection.find({}, {'fields': ['b']}, function(err, cursor) {
        cursor.toArray(function(err, items) {
          test.equal(("" + regexp), ("" + items[0].b));
          // Let's close the db
          test.done();
        });
      });
    });
  });    
}

exports.shouldCorrectlyFindDocumentsByRegExp = function(test) {
  // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
  // the original regex invalid, and leads to segmentation fault.
  client.createCollection('test_regex_serialization', function(err, collection) {
    collection.insert({keywords: ["test", "segmentation", "fault", "regex", "serialization", "native"]}, {safe:true}, function(err, r) {
      
      var count = 20,
          run = function(i) {
            // search by regex            
            collection.findOne({keywords: {$all: [/ser/, /test/, /seg/, /fault/, /nat/]}}, function(err, item) {            
              test.equal(6, item.keywords.length);              
              if (i === 0) {
               test.done()
             }
            });
          };
      // loop a few times to catch the / in trailing chars case
      while (count--) {
        run(count);
      }
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