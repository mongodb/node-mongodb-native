var mongodb = require("../../lib/mongodb"),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager;

var RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
RS.startSet(true, function(err, result) {      
  // Replica configuration
  var replSet = new mongodb.ReplSetServers( [ 
      new mongodb.Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new mongodb.Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name}
  );
  
  new mongodb.Db("data", replSet).open(function(err, db) {
    console.log("------------------------------------------------")
    console.dir(err)
    
    db.dropDatabase(function(err, result) {
      // Get collection
      var collection = db.collection('documents');
      var totalDocumentsToInsert = 100000;
      // total count
      var inserted = 0;

      // Insert 100 000 documents to verify correct pullback
      for(var i = 0; i < totalDocumentsToInsert; i++) {
        collection.insert({games:1, country:1, username:1}, {safe:{w:2, wtimout:10000}}, function(err, result) {
          inserted = inserted + 1;

          if(inserted == totalDocumentsToInsert) {

            // Fetch all the documents as an array and count them
            collection.find().toArray(function(err, items) {
              console.log("----------------------------------------------------")
              console.log(items.length)
              
              db.close();              
            });
          }
        });
      }          
    })    
  });
});
  
