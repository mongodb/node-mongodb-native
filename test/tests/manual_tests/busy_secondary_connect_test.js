var http            = require('http'),
    os              = require('os'),
    mongodb         = require('../../../lib/mongodb'),
    Server          = mongodb.Server,
    ReadPreference = mongodb.ReadPreference,
    ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager,
    ReplSetServers  = mongodb.ReplSetServers,
    Db              = mongodb.Db,
    MongoClient     = mongodb.MongoClient;

console.log("===================== attempting connected")



//
// Connect
MongoClient.connect('mongodb://a:a@localhost:30001,localhost:30002/test', function(err, db) {
  if(err) throw err;
  console.log("===================== connected")
  db.serverConfig.on('joined', function(type, master, server) {
    console.log("A " + type + " server joined " + server.name)
  })

  db.serverConfig.on('ha_ismaster', function(err, master) {
    console.log("============================ ha ping")    
    console.dir(Object.keys(db.serverConfig._state.secondaries))
  })

  setInterval(function() {
    db.collection('test').findOne({}, {readPreference: 'secondary'}, function(err, doc) {
      console.log("=================================== ping :: ")
      console.dir(err)
      console.dir(doc)
    });
  }, 1000);
  // // Drop the database
  // db.dropDatabase(function(err, result) {
  //   if(err) throw err;

  //   console.log("============================== build bulk");
  //   // Insert a shit-ton of data
  //   var bulk = db.collection('t').initializeUnorderedBulkOp();
  //   for(var i = 0; i < 500000; i++) {
  //     bulk.insert({a: i
  //       , string: "fdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdf"
  //       , string2: "fdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdf"
  //       , string3: "fdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdf"
  //       , string4: "fdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdffdsfsdfdsfdsfsdf"})
  //   } 

  //   console.log("============================== execute bulk");
  //   // Let's execute the bulk
  //   bulk.execute({w:1}, function(err, result) {
  //     if(err) throw err;
  //     console.log("============================== bulk done");

      // // Drop the indexes
      // db.collection('t').dropIndexes(function(err, r) {
      //   if(err) throw err;

      //   // Fire off connect attempt
      //   setTimeout(function() {
      //     MongoClient.connect('mongodb://a:a@localhost:30000,localhost:30001,localhost:30002/test?authSource=admin', function(err, db) {
      //       console.log("============================== connected");
      //     })
      //   }, 1000);

      //   console.log("============================== start indexing");
      //   // Force foreground indexing
      //   db.collection('t').ensureIndex({string:1}, {w:'majority', wtimeout: 10000}, function(err, result) {
      //     console.log("============================== indexing done");
      //     process.exit(0);
      //   });
      // });
  //   });
  // });

  // console.dir(err)
  // db.close();
});