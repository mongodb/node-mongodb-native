"use strict";
var mongodb         = require('../../lib/mongodb'),
    Server          = mongodb.Server,
    ReadPreference = mongodb.ReadPreference,
    ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
    ReplSetServers  = mongodb.ReplSetServers,
    Db              = mongodb.Db;

var repset = new ReplSetServers( [
  new Server('localhost', 30000, {auto_reconnect: true}),
  new Server('localhost', 30001, {auto_reconnect: true}),
  new Server('localhost', 30002, {auto_reconnect: true}),
], {rs_name : 'rs0'});

var RS = new ReplicaSetManager({name:"rs0", retries:120, secondary_count:2, passive_count:0, arbiter_count:0});
RS.startSet(true, function(err, result) {
  var db = new Db("somedb", repset, {w:1});
  db.open(function(err, db) {
    if(err) {
    if(db)
      db.close()
    }
  });

  function mongo_store(message_id, message_content) {
    console.log("== mongo_store")
    var content_collection = 'mail';
    
    db.collection(content_collection, function(err, collection) {
      var doc = {'message_id': message_id, 'content': message_content};

      collection.insert(doc, {safe:true}, function(err, result) {
        if(err) {
          console.warn(err);
        }
      });
    });
  }

  function run() {
    mongo_store('hello', 'hello world');
    
    setTimeout(function() {
      run();
    }, 2000);
  }

  run();
});