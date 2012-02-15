var mongodb = require("../../lib/mongodb"),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager;

var options = {
  auto_reconnect: true,
  poolSize: 1,
  // socketOptions: { keepAlive: 100, timeout:8000 }
  socketOptions: { timeout:8000 }
};

var userObjects = [];

// Build user array
for(var i = 0; i < 122; i++) {
  userObjects.push({'user_id':i});
}

var queryCount = 0;
var replSet = new mongodb.Server( 'localhost', 27017, options);

var users;
var db = new mongodb.Db("data", replSet);
db.on("error", function(err) {
  console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
  console.dir(err)
})

db.open(function(err, client){
  if(err){
    console.log("[%s] %s", new Date, err.stack || err);
    return;
  }
  
  if(users){
    console.log("[%s] Reconnected?!", new Date);
    return;
  }
  
  client.collection("users", function(err, coll){      
    coll.remove({}, {safe:true}, function(err) {
      coll.insert(userObjects, {safe:true}, function(err, result) {
        users = coll;
        query();        
      })      
    });
  });    
});

function query(){
  var current = queryCount++;
  console.log("[%s] #%s querying all users", new Date, current);
  // setTimeout(query, 32 * 1000);
  setTimeout(query, 7 * 1000);
  users.find().count(function(err, all){
    if(err){
      console.log("[%s] #%s %s", new Date, current, err.stack || err);
    }else{
      console.log("[%s] #%s found %s users", new Date, current, all);
    }
  });
}