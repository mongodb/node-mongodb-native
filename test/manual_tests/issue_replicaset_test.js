var mongodb = require("../../lib/mongodb"),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager;

var options = {
  auto_reconnect: true,
  poolSize: 4,
  socketOptions: { keepAlive: 100, timeout:6000 }
};

var userObjects = [];

// Build user array
for(var i = 0; i < 122; i++) {
  userObjects.push({'user_id':i});
}

// Manual config
// mongod --rest --replSet mlocal --oplogSize 8 --dbpath=./d1
// mongod --port 27018 --rest --replSet mlocal --dbpath=./d2
// mongod --port=27019 --rest --replSet mlocal --dbpath=./d3
// {"_id" : "mlocal", "members" : [{"_id" : 0,"host" : "localhost:27017"},{"_id" : 1,"host" : "localhost:27018"},{"_id" : 2,"host" : "localhost:27019","arbiterOnly" : true}]}

// Replica configuration
var replSet = new mongodb.ReplSetServers( [ 
    new mongodb.Server( 'localhost', 27017, { auto_reconnect: true } ),
    new mongodb.Server( 'localhost', 27018, { auto_reconnect: true } ),
    new mongodb.Server( 'localhost', 27019, { auto_reconnect: true } )
  ], 
  {rs_name:'mlocal'}
);

var queryCount = 0;
var users;
var db = new mongodb.Db("data", replSet);
db.on("error", function(err) {
  console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
  console.dir(err)
})

db.open(function(err, client){
  // Just close the connection
  db.close();
});
