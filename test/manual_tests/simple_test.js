var Db = require('../../lib/mongodb').Db, 
    Server = require('../../lib/mongodb').Server; 

var _db = new Db('mydb', new Server('localhost', 27017, {auto_reconnect: true, poolSize: 2})); 
_db.open(function(err, db) { 
  
  db.collection('coll1', function(err, coll) { 
      var expireDate = new Date(); 
      expireDate.setHours(expireDate.getHours() + 24); 
      coll.remove({valid_to: {$lt: expireDate}}, {safe: true}, function(err) { 
          console.log('Deleted the items'); 
      }); 
  }); 

  db.collection('coll2', function(err, coll) { 
      coll.find({}, {}, function(err, cursor) { 
          console.log('Turning the cursor into an array'); 
          cursor.toArray(function(err, docs) { 
              console.log('Got the array'); 
          }); 
      }); 
  });  
}); 