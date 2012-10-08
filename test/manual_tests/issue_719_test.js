var mongodb = require('../../lib/mongodb'),
    Db = mongodb.Db,
    Server = mongodb.Server,
    ReplSetServers = mongodb.ReplSetServers,
    ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
    dbOpts = {
        rs_name: 'testReplSet'
    },
    server1 = new Server('localhost', 30000, {auto_reconnect: true, safe: true, strict: true}),
    server2 = new Server('localhost', 30000, {auto_reconnect: true, safe: true, strict: true}),
    server3 = new Server('localhost', 30000, {auto_reconnect: true, safe: true, strict: true}),
    replSet = new ReplSetServers([server1, server2, server3], dbOpts),
    db = new Db('test', replSet);

RS = new ReplicaSetManager({name:"testReplSet", retries:120, secondary_count:2, passive_count:0, arbiter_count:0});
RS.startSet(true, function(err, result) {
  db.open(function(err, db) {
    if (!err) {
      console.log('connected to db');
      setTimeout(function(){
        console.log('try get collection');
        db.collection('docs', function(err, collection) {
          if (!err) {
            console.log('try insert');
            collection.insert({test:'value'}, {safe: true}, function(error, result) {
              console.log('This never gets called when the primary goes down after we are connected');
              process.exit();
            });
          }
        });
      }, 60000);
    }
  });
});