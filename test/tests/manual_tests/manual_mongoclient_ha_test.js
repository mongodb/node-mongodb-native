var http              = require('http'),
    os                = require('os'),    
    mongodb           = require('../../../lib/mongodb'),
    async             = require('async'),
    ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager,
    MongoClient       = mongodb.MongoClient;

console.log('launching simple mongo application...');

var admin_db;
var db1;
var db2;

var simpleQuery = function(callback) {
  console.log("=================================== simpleQuery")
  // if (db1==null) {
  //   db1 = admin_db.db('db1');
  // }

  db1.collection('foo').findOne({}, function (err, results) {
    console.log("=========================== FOO find");
    if(err) console.dir(err)
    console.log(results);

    // if (db2==null) {
    //   db2 = admin_db.db('db2');
    // }
  
    db2.collection('bar').findOne({}, function (err, results) {
      console.log("=========================== BAR find");
      if(err) console.dir(err)
      console.log(results);

      setTimeout(callback, 2000);
    });
  });
}

var connection_string = "mongodb://localhost:30000,localhost:30001,localhost:30002/admin?replicaSet=testappset&autoReconnect=true";
var number_of_times = 5;

RS = new ReplicaSetManager({name:"testappset", retries:120, secondary_count:2, passive_count:0, arbiter_count:0});
RS.startSet(true, function(err, result) {
  // process.exit(0)
  if(err != null) throw err;

  MongoClient.connect(connection_string, function(err, db) {
    if(err) {
      console.dir(err);
    } else {
      admin_db = db;
      db1 = db.db('db1');
      db2 = db.db('db2');

      db1.collection('foo').insert({"foo":true}, function(){});
      db2.collection('bar').insert({"bar":true}, function(){});

      console.log('connected');
      async.whilst(
        function() {
          console.log("=== number_of_times :: " + number_of_times);
          number_of_times = number_of_times - 1;
          return number_of_times > 0;
        },
        function(callback) {
          simpleQuery(callback);
        },
        function() {
          db.close();
          console.log("done");
        }
      );      
    }
  });
});

