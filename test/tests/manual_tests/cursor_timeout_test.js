var mongodb = require("../../../lib/mongodb"),
  Binary = mongodb.Binary,
  request = true;

var db = new mongodb.Db('test_db', new mongodb.Server("127.0.0.1", 27017, {
  auto_reconnect: true
}), {w:1});

// open connection
db.open(function(err, client) {
  if (err) {
    console.error(err);
  }

  var docs = [];
  for(var i = 0; i < 1000; i++) {
    docs.push({a:i, b:1});
  }

  var count =  60 * 11;
  // var collection = new mongodb.Collection(client, 'test_collection');
  var collection = db.collection('test');
  collection.insert(docs, function(err, results) {
    var cursor = collection.find({b:1});
    cursor.batchSize(2);
    cursor.nextObject(function(err, item) {
      // for(var i = 0; i < 99; i++) cursor.nextObject(function() {});
      // console.dir(item)
      // console.dir(cursor.items.length)
      // Wait for timeout

      setInterval(function() {
        console.log("count :: " + count);
        count = count - 1;

        if(count == 0) {
          cursor.nextObject(function(err, item) {
            console.log("--------------------------------------------- 0")
            console.dir(err);
            console.dir(item);

            cursor.nextObject(function(err, item) {
              console.log("--------------------------------------------- 1")
              console.dir(err);
              console.dir(item);

              db.close();
            });
          });          
        }
      }, 1000);
    });


  });
});