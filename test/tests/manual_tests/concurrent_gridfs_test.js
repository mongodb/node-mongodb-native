var MongoClient = require('../../../lib/mongodb').MongoClient
  , GridStore = require('../../../lib/mongodb').GridStore
  , ObjectID = require('../../../lib/mongodb').ObjectID
  , fs = require('fs');

MongoClient.connect("mongodb://localhost:27017/concurrent", function(err, db) {  
  if(err) throw err;
  
  setInterval(function() {
    var id = new ObjectID();
    var gs = new GridStore(db, id, "w", {chunkSize: 64000});  
    // Store data for comparison
    var data = fs.readFileSync(__dirname + '/../functional/gridstore/iya_logo_final_bw.jpg');
    // Write a file
    gs.writeFile(__dirname + '/../functional/gridstore/iya_logo_final_bw.jpg', function(err) {
      if(err) throw err;
      console.log("================ wrote file :: " + id)

      GridStore.read(db, id, function(err, r) {
        if(err) throw err;        
    
        console.log("================ read file :: " + id)
        if(r.toString('hex') != data.toString('hex')) {
          console.log("=================== CORRUPT FILE :: " + id); 
        }
      });

      // var gs1 = new GridStore(db, id, "r", {chunkSize: 64000});
      // gs1.
    });    
  }, 100);
});