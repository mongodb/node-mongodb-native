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
var maxUserId = 10000;

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
    {rs_name:RS.name, read_secondary:true, readPreference:mongodb.Server.READ_SECONDARY}
  );

  var collA;
  var collB;

  var db = new mongodb.Db("data", replSet);
  db.open(function(err, client){
    console.log("Connected");
    if(err != null) {
      console.dir(err);
      return;
    }
    
    var userCollection = client.collection('users');
    var accountCollection = client.collection('accounts');
    
    // Generate a bunch of fake accounts
    var accountDocs = [];
    for(var i = 0; i < 10000; i++) {
      accountDocs.push({
        account_id:i,
        'somedata': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata2': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata3': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata4': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata5': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata6': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata7': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata8': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata9': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad'
      })
    }
    
    // Generate a bunch of false users
    var userDocs = [];
    for(var i = 0; i < maxUserId; i++) {
      // Generate a random number of account ids
      var numberOfAccounts = Math.floor(Math.random(10000));
      // Generate an array of random numbers
      var accountIds = [];
      for(var j = 0; j < numberOfAccounts; j++) {
        numberOfAccounts.push(Math.floor(Math.random(10000)));
      }
      
      // Generate a user
      userDocs.push({
        user_id:i,
        ids:accountIds,
        'somedata': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata2': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata3': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata4': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata5': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata6': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata7': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata8': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad',
        'somedata9': 'dfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaaddfdfdsaaad'        
      })
    }
    
    // Insert all the docs
    userCollection.insert(userDocs, {safe:true}, function(err, result) {
      console.dir(err);
      
      accountCollection.insert(accountDocs, {safe:true}, function(err, result) {
        console.dir(err);
        
        var timeoutFunc = function() {
          lookup(function(err, result) {
            console.log("-------------------------------------------- lookedup :: " + counter);
            counter = counter + 1;
            process.nextTick(timeoutFunc, 1);
          });
        }        
        
        process.nextTick(timeoutFunc, 1);
      });
    });
  });

  function lookup(cb){
    // Locate a random user
    db.collection('users', function(err, userCollection) {
      
      userCollection.findOne({user_id:Math.floor(Math.random(maxUserId))}, function(err, user) {        
        if(err == null && user != null) {
          console.log("-------------------------------------------- findOne");
          
          // Fetch all the accounts
          db.collection('accounts', function(err, accountCollection) {
            
            accountCollection.find({account_id:{$in:user.ids}}).toArray(function(err, accounts) {
              if(err == null && accounts != null) {
                console.log("-------------------------------------------- findAccounts :: " + accounts.length);
                cb(null, null);
              } else {
                console.log("-------------------------------------------- findAccounts ERROR");
                cb(err, null);
              }              
            });            
          });          
        } else {
          console.log("-------------------------------------------- findOne ERROR");
          cb(err, null);
        }
      });      
    });
  }
});