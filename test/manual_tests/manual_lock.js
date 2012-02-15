var mongodb = require("../../lib/mongodb"),
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager;

var options = {
  auto_reconnect: true,
  poolSize: 4,
  socketOptions: { keepAlive: 100, timeout:30000 }
};

var userObjects = [];
var counter = 0;
var counter2 = 0;

// Build user array
for(var i = 0; i < 122; i++) {
  userObjects.push({a:true, b:true});
}

RS = new ReplicaSetManager({retries:120, secondary_count:1, passive_count:0, arbiter_count:1});
RS.startSet(true, function(err, result) {      
  // Replica configuration
  var replSet = new mongodb.ReplSetServers( [ 
      new mongodb.Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name}
  );

  var collA;
  var collB;

  var db = new mongodb.Db("data", replSet);
  db.open(function(err, client){
    console.log("Connected");
    client.collection("collA", function(err, coll){      
      collA = coll;

      coll.insert(userObjects, {safe:true}, function(err, result) {

        client.collection("collB", function(err, coll){                
          collB = coll;

          coll.insert(userObjects, {safe:true}, function(err, result) {
                  
            var timeoutFunc = function() {
              lookup(function(err, result) {
                console.log("-------------------------------------------- lookedup")
                process.nextTick(timeoutFunc, 1);
              })
            }   
        
            process.nextTick(timeoutFunc, 1);     
          });
        });
      });
    });    
  });

  function lookup(cb){
    var a, b;
    var waiting = 2;

    collA.findOne({ a: true }, function(err, result){
      a = result;
      waiting--;
      if(waiting === 0){
        console.log("---------------------------------------------------------------------- collA :: " + counter);
        counter = counter + 1;
        cb(null, [a, b]);
      }
    });

    collB.findOne({ b: true }, function(err, result){
      b = result;
      waiting--;
      if(waiting === 0){
        console.log("---------------------------------------------------------------------- collB :: " + counter);
        counter = counter + 1;
        cb(null, [a, b]);
      }
    });
  }
});      