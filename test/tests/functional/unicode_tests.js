/**
 * @ignore
 */
exports.shouldCorrectlySaveUnicodeContainingDocument = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
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

    db.createCollection('test_should_correctly_save_unicode_containing_document', function(err, collection) {
      doc['_id'] = 'felixge';

      collection.save(doc, {w:1}, function(err, doc) {
        collection.findOne(function(err, doc) {
          test.equal('felixge', doc._id);
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertUnicodeCharacters = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('unicode_test_collection', function(err, collection) {
      var test_strings = ["ouooueauiOUOOUEAUI", "öüóőúéáűíÖÜÓŐÚÉÁŰÍ", "本荘由利地域に洪水警報"];
      collection.insert({id: 0, text: test_strings[0]}, {w:1}, function(err, ids) {
        collection.insert({id: 1, text: test_strings[1]}, {w:1}, function(err, ids) {
          collection.insert({id: 2, text: test_strings[2]}, {w:1}, function(err, ids) {
            collection.find().each(function(err, item) {
              if(item != null) {
                test.equal(test_strings[item.id], item.text);
              } else {
                db.close();
                test.done();                  
              }
            });  
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCreateObjectWithChineseObjectName = function(configuration, test) {
  var object = {'客家话' : 'Hello'};

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('create_object_with_chinese_object_name', function(err, r) {
      db.collection('create_object_with_chinese_object_name', function(err, collection) {        
        
        collection.insert(object, {w:1}, function(err, result) {
          collection.findOne(function(err, item) {
            test.equal(object['客家话'], item['客家话'])

            collection.find().toArray(function(err, items) {
              test.equal(object['客家话'], items[0]['客家话'])
              db.close();
              test.done();
            })
          })          
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUT8KeyNames = function(configuration, test) { 
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_utf8_key_name', function(err, collection) { 
      collection.insert({'šđžčćŠĐŽČĆ':1}, {w:1}, function(err, ids) { 
            // finished_test({test_utf8_key_name:'ok'}); 
        collection.find({}, {}, {'fields': ['šđžčćŠĐŽČĆ']}).toArray(function(err, items) { 
          test.equal(1, items[0]['šđžčćŠĐŽČĆ']); 
          // Let's close the db 
          db.close();
          test.done();
        }); 
      }); 
    }); 
  });
}