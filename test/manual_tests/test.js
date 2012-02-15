var mongodb = require("./lib/mongodb"),
  ReplicaSetManager = require('./test/tools/replica_set_manager').ReplicaSetManager;

var options = {
  auto_reconnect: true,
  poolSize: 4,
  socketOptions: { keepAlive: 100, timeout:30000 }
};

var userObjects = [];

// Build user array
for(var i = 0; i < 122; i++) {
  userObjects.push({'user_id':i});
}

// var replSet = new mongodb.ReplSetServers([
//   new mongodb.Server("mongo-1", 27017, options),
//   new mongodb.Server("mongo-2", 27017, options),
//   new mongodb.Server("mongo-3", 27017, options)
// ]);

RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
RS.startSet(true, function(err, result) {      
  // Replica configuration
  var replSet = new mongodb.ReplSetServers( [ 
      new mongodb.Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name}
    // {rs_name:RS.name, strategy:'ping'}
    // {rs_name:RS.name, strategy:'statistical'}
  );

  var users;
  var db = new mongodb.Db("data", replSet);
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
      console.log("Connected");
      coll.insert(userObjects, {safe:true}, function(err, result) {
        users = coll;
        query();        
      })
    });    
    // client.collection("users", function(err, users){
    //   console.log("Connected");
    //   db.users = users;
    //   query();
    // });
  });

  function query(){
    console.log("[%s] querying all users", new Date);
    // setTimeout(query, 70 * 60 * 1000);
    setTimeout(query, 32 * 1000);
    db.collection('users', function(err, coll) {
      if(err){
        console.log("[0] :: [%s] %s", new Date, err.stack || err);
      }

      coll.find().count(function(err, all){
        if(err){
          console.log("[1] :: [%s] %s", new Date, err.stack || err);
        }else{
          console.log("[2] :: [%s] found %s users", new Date, all);
        }
      });      
    })
  }
});      


