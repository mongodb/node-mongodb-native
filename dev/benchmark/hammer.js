var BSON = require('../../lib/mongodb').BSONNative.BSON,
  ObjectID = require('../../lib/mongodb').BSONNative.ObjectID,
  Code = require('../../lib/mongodb').BSONNative.Code,
  debug = require('util').debug,
  inspect = require('util').inspect,
  mongodb = require('../../lib/mongodb'),
  Db = mongodb.Db,
  Server = mongodb.Server,
  Step = require("step");

var BSON = require('../../lib/mongodb').BSONPure.BSON,
  ObjectID = require('../../lib/mongodb').BSONPure.ObjectID;

// Open the db connection
new Db('hammer_db', new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 20}), {native_parser: false}).open(function(err, db) {
  db.dropCollection('hammer_collection', function(err, result) {
    db.admin().authenticate('admin', 'admin', function(err, result) {
      var i = 0;
      // Fire random command
      setInterval(function() {
        var command = Math.round(Math.random() * 4);
        command = 1;

        // debug("================= execute :: " + i++ + " = " + command)

        // Execute the command
        if(command == 1) {
          // Execute an insert
          db.collection('hammer_collection', function(err, collection) {
            collection.insert(randomDoc(), {safe:false}, function(err, result) {
              debug("---------------------------------------- INSERT")
            });
          });
        } else if(command == 2) {
          // Update some random record
          db.collection('hammer_collection', function(err, collection) {
            collection.findOne({}, function(err, item) {
              if(!err && item != null) {
                // Grab key before we bork it
                var _id = item._id;
                var keys = Object.keys(item);
                var objLength = keys.length;
                var pickRandomItem = Math.round(Math.random() * objLength);
                // Show a random doc in
                item[keys[pickRandomItem]] = randomDoc();
                // Update doc
                collection.update({'_id':_id}, item, {safe:false}, function(err, result) {
                  debug("---------------------------------------- UPDATE")                
                });
              }
            })
          });
        } else if(command == 3) {
          // Update some random record
          db.collection('hammer_collection', function(err, collection) {
            collection.findOne({}, function(err, item) {
              if(!err && item != null) {
                // Update doc
                collection.remove({'_id':item._id}, {safe:false}, function(err, result) {
                  debug("---------------------------------------- REMOVE")
                });
              }
            })
          });
        } else if(command == 4) {
          db.collection('hammer_collection', function(err, collection) {
            collection.find().limit(100).toArray(function(err, items) {                        
              debug("---------------------------------------- QUERY :: " + items.length)
            })
          })
        }      
      }, 1000);          
    })
  });
});

//
// Create a random document
var randomDoc = function() {
  // var numberOfElements = Math.round(Math.random() * 100);
  var object = {};
  object['var'] = "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  
  // for(var i = 0; i< numberOfElements; i++) {
  //   // Pick an element and add it
  //   var element = Math.round(Math.random() * 4);
  //   var name = randomName();
  //   
  //   if(element == 1) {
  //     object[name] = randomString();
  //   } else if(element == 2) {
  //     object[name] = Math.round(Math.random() * 4294967295);
  //   } else if(element == 3) {
  //     object[name] = Math.round(Math.random() * -4294967295);
  //   } else if(element == 4) {
  // 
  //   }
  // }
  
  return object;
}

//
// Create a random name
var randomName = function() {
  var numberOfElements = Math.round(Math.random() * 250);  
  var buffer = new Buffer(numberOfElements);
  
  for(var i = 0; i< numberOfElements; i++) {
    buffer[i] = 97 + Math.round(Math.random() * (122-97));
  }
  
  return buffer.toString();
}

//
// Create a random string
var randomString = function() {
  var numberOfElements = Math.round(Math.random() * 250);  
  var buffer = new Buffer(numberOfElements);
  
  for(var i = 0; i< numberOfElements; i++) {
    buffer[i] = Math.round(Math.random() * 255);
  }
  
  return buffer.toString();
}

















