var mongodb = require("../../../lib/mongodb"),
  Binary = mongodb.Binary,
  request = true;

var db = new mongodb.Db('test_db', new mongodb.Server("127.0.0.1", 27017, {
  auto_reconnect: true
}), {w:1});

// open connection
db.open(function(err, db) {
  if(err) {
    console.error(err);
  }

  // Number of inserts
  var totalNumberOfInserts = 100000;
  var total = (totalNumberOfInserts/1000);
  // Insert a lot of documents
  for(var i = 0; i < (totalNumberOfInserts/1000); i++) {
    var docs = [];

    for(var j = 0; j < 1000; j++) {
      docs.push({a:i});
    }

    db.collection('test').insert(docs, {w:1}, function(err, result) {
      total = total - 1;

      if(total == 0) {
        console.log("=================== insert done")
        query(db)
      }
    })
  }
});

var query = function(db) {
  var counter = 0;

  db.collection('test').find().each(function(err, doc) {
    if(err)
      throw err;

    if(doc == null) {
      console.log("=========== done")
      process.exit(0);
    } else {
      console.log("doc rec :: " + counter++)
    }
  })
}