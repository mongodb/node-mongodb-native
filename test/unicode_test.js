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

exports.shouldCorrectlySaveUnicodeContainingDocument = function(test) {
  var doc = {statuses_count: 1687
  , created_at: 'Mon Oct 22 14:55:08 +0000 2007'
  , description: 'NodeJS hacker, Cofounder of Debuggable, CakePHP core alumnus'
  , favourites_count: 6
  , profile_sidebar_fill_color: 'EADEAA'
  , screen_name: 'felixge'
  , status:
     { created_at: 'Fri Mar 12 08:59:44 +0000 2010'
     , in_reply_to_screen_name: null
     , truncated: false
     , in_reply_to_user_id: null
     , source: '<a href="http://www.atebits.com/" rel="nofollow">Tweetie</a>'
     , favorited: false
     , in_reply_to_status_id: null
     , id: 10364119169
     , text: '#berlin #snow = #fail : ('
     }
  , contributors_enabled: false
  , following: null
  , geo_enabled: false
  , time_zone: 'Eastern Time (US & Canada)'
  , profile_sidebar_border_color: 'D9B17E'
  , url: 'http://debuggable.com'
  , verified: false
  , location: 'Berlin'
  , profile_text_color: '333333'
  , notifications: null
  , profile_background_image_url: 'http://s.twimg.com/a/1268354287/images/themes/theme8/bg.gif'
  , protected: false
  , profile_link_color: '9D582E'
  , followers_count: 840
  , name: 'Felix Geisend\u00f6rfer'
  , profile_background_tile: false
  , id: 9599342
  , lang: 'en'
  , utc_offset: -18000
  , friends_count: 450
  , profile_background_color: '8B542B'
  , profile_image_url: 'http://a3.twimg.com/profile_images/107142257/passbild-square_normal.jpg'
  };

  client.createCollection('test_should_correctly_save_unicode_containing_document', function(err, collection) {
    doc['_id'] = 'felixge';

    collection.save(doc, {safe:true}, function(err, doc) {
      collection.findOne(function(err, doc) {
        test.equal('felixge', doc._id);
        test.done();
      });
    });
  });    
}

// Test unicode characters
exports.shouldCorrectlyInsertUnicodeCharacters = function(test) {
  client.createCollection('unicode_test_collection', function(err, collection) {
    var test_strings = ["ouooueauiOUOOUEAUI", "öüóőúéáűíÖÜÓŐÚÉÁŰÍ", "本荘由利地域に洪水警報"];
    collection.insert({id: 0, text: test_strings[0]}, {safe:true}, function(err, ids) {
      collection.insert({id: 1, text: test_strings[1]}, {safe:true}, function(err, ids) {
        collection.insert({id: 2, text: test_strings[2]}, {safe:true}, function(err, ids) {
          collection.find(function(err, cursor) {
            cursor.each(function(err, item) {
              if(item != null) {
                test.equal(test_strings[item.id], item.text);
              } else {
                test.done();                  
              }
            });  
          });
        });
      });
    });
  });    
}

exports.shouldCreateObjectWithChineseObjectName = function(test) {
  var object = {'客家话' : 'Hello'};
  
  client.createCollection('create_object_with_chinese_object_name', function(err, r) {
    client.collection('create_object_with_chinese_object_name', function(err, collection) {        
      
      collection.insert(object, {safe:true}, function(err, result) {
        collection.findOne(function(err, item) {
          test.equal(object['客家话'], item['客家话'])

          collection.find().toArray(function(err, items) {
            test.equal(object['客家话'], items[0]['客家话'])
            test.done();
          })
        })          
      });
    })
  })            
}

exports.shouldCorrectlyHandleUT8KeyNames = function(test) { 
  client.createCollection('test_utf8_key_name', function(err, collection) { 
    collection.insert({'šđžčćŠĐŽČĆ':1}, {safe:true}, function(err, ids) { 
          // finished_test({test_utf8_key_name:'ok'}); 
      collection.find({}, {'fields': ['šđžčćŠĐŽČĆ']}, function(err, cursor) { 
        cursor.toArray(function(err, items) { 
          // console.log("---------------------------------------------------------------")
          // console.dir(err)
          // console.dir(items)
          // 
          test.equal(1, items[0]['šđžčćŠĐŽČĆ']); 
          // Let's close the db 
          test.done();
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