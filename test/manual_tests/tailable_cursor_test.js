var Db = require('../../lib/mongodb').Db,
    Server = require('../../lib/mongodb').Server;

var _db = new Db('mydb', new Server('localhost', 27017, {
  auto_reconnect: true,
  poolSize: 2,
  socketOptions:
  {
    timeout: 30 * 1000
  }
}));
_db.open(function(err, db) {
  if(err) throw err;
  // Insert a document every minute
  setInterval(function() {
    console.log("insert a record");
    db.collection("tailableCollection").insert({a:1, date: new Date()});
  }, 1000 * 5);

  // db.dropCollection("tailableCollection", function(err, result) {
    // Set up tailable cursor
    db.createCollection("tailableCollection", {w:1, capped:true, size: 100000}, function(err, collection) {

      console.log("======================== ++++++++++++++++++++++++++++++++++++++++");
      // db.collection("tailableCollection").find({}, {tailable:true, tailableRetryInterval:1000}).each(function(err, item) {
      db.collection("tailableCollection").find({}, {tailable:true, awaitdata:true, tailableRetryInterval:1000}).each(function(err, item) {
        if(item) {
          console.log("======================== each");
        }
      });
    });
  // });
});