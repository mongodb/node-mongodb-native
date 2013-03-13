var mongodb = require("../../lib/mongodb"),
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
    docs.push({a:1, b: new Binary(new Buffer(256))});
  }

  var collection = new mongodb.Collection(client, 'test_collection');
  collection.insert(docs, function(err, results) {
    var cursor = collection.find();
    cursor.nextObject(function(err, item) {
      for(var i = 0; i < 99; i++) cursor.nextObject(function() {});
      console.dir(cursor.items.length)
      // Wait for timeout
      setTimeout(function() {

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
    }, 1000 * 60 * 11);
    });


  });
});