var BSON = require('../../lib/mongodb').BSONNative.BSON,
  ObjectID = require('../../lib/mongodb').BSONNative.ObjectID,
  Code = require('../../lib/mongodb').BSONNative.Code,
  debug = require('util').debug,
  inspect = require('util').inspect,
  mongodb = require('../../lib/mongodb'),
  Db = mongodb.Db,
  Server = mongodb.Server,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("../../deps/step/lib/step");

var BSON = require('../../lib/mongodb').BSONPure.BSON,
  ObjectID = require('../../lib/mongodb').BSONPure.ObjectID;

var db = null;
var poolSize = 1;
var RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
RS.startSet(true, function(err, result) {      
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true, poolSize: poolSize } ),
      // new Server( RS.host, RS.ports[0], { auto_reconnect: true, poolSize: poolSize } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true, poolSize: poolSize } )
    ], 
    {rs_name:RS.name, readPreference:Server.READ_SECONDARY, poolSize: poolSize}
  );
  
  // Open the db connection
  new Db('hammer_db', replSet, {native_parser: false, retryMiliSeconds: 1000}).open(function(err, p_db) {
    db = p_db;
    if(err != null) throw err;
    // Start hammering
    hammerTime();
  });
});      

// Hammer the set
var hammerTime = function() {
  db.dropCollection('hammer_collection', function(err, result) {
    var i = 0;
    // Fire random command
    setInterval(function() {
      var command = Math.round(Math.random() * 4);
      // command = 2;

      debug("================= execute :: " + i++ + " = " + command)

      // Execute the command
      if(command == 1) {
        // Execute an insert
        db.collection('hammer_collection', function(err, collection) {
          collection.insert(randomDoc(), {safe:false}, function(err, result) {
            debug("---------------------------------------- INSERT ")
            debug(inspect(err))
          });
        });
      } else if(command == 2) {
        // Update some random record
        db.collection('hammer_collection', function(err, collection) {
          // console.log("================================================================== update :: 0")
          if(err != null) {
            console.log("------------------------------------- error update 1")
            console.dir(err)                
          }

          collection.findOne({}, function(err, item) {
            if(err == null && item != null) {
              // console.log("================================================================== update :: 1")
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
            } else {
              console.log("------------------------------------- error update 2")
              console.dir(err)
            }
          })
        });
      } else if(command == 3) {
        // Update some random record
        db.collection('hammer_collection', function(err, collection) {
          // if(err != null) {
          //   console.log("------------------------------------- error remove 1")
          //   console.dir(err)                
          // }

          collection.findOne({}, function(err, item) {
            // debug(inspect(err))
            // debug(inspect(item))

            if(err == null && item != null) {
              // Update doc
              collection.remove({'_id':item._id}, {safe:false}, function(err, result) {
                debug("---------------------------------------- REMOVE")
              });
            } else {
              // console.log("------------------------------------- error remove 2")
              // console.dir(err)
            }
          })
        });
      } else if(command == 4) {
        db.collection('hammer_collection', function(err, collection) {
          // if(err != null) {
          //   console.log("------------------------------------- error query 1")
          //   console.dir(err)                
          // }

          collection.find().limit(100).toArray(function(err, items) {                                    
            if(err != null) {
              console.log("------------------------------------- error query 2")
              console.dir(err)                
            } else {
              debug("---------------------------------------- QUERY :: " + items.length)              
            }
          })
        })
      }      
    }, 100);    
  });
}

//
// Create a random document
var randomDoc = function() {
  var numberOfElements = Math.round(Math.random() * 100);
  var object = {};
  
  for(var i = 0; i< numberOfElements; i++) {
    // Pick an element and add it
    var element = Math.round(Math.random() * 4);
    var name = randomName();
    
    if(element == 1) {
      object[name] = randomString();
    } else if(element == 2) {
      object[name] = Math.round(Math.random() * 4294967295);
    } else if(element == 3) {
      object[name] = Math.round(Math.random() * -4294967295);
    } else if(element == 4) {

    }
  }
  
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

















