var mongodb = require("./"),
  ObjectID = mongodb.ObjectID,
  CoreConnection = mongodb.CoreConnection,
  CoreServer = mongodb.CoreServer;

var uri = "mongodb://localhost:27017/test";
// mongostat -u foo -p bar --authenticationDatabase driver-test --host rs-ds021331/ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331 --discover
// var options = {server: {socketOptions: {connectTimeoutMS: 5000, socketTimeoutMS: 15000}}}
// var interval = 100;
// var total = 1000;

// // console.dir(CoreConnection)
// CoreConnection.enableConnectionAccounting();
// CoreServer.enableServerAccounting();

// var openThenClose = function(count){
var MongoClient = mongodb.MongoClient;

MongoClient.connect(uri, {}, function(err, db) {
  var date = new Date();
  date.setTime(0);
  date.setSeconds(1)
  date.setMilliseconds(0);

  var a = new ObjectID("000000010000000000000001");
  var b = ObjectID.createFromTime(date.getTime());
  var c = new ObjectID();
  c.generationTime = date.getTime();

  db.collection('t1').insertMany([
    {_id: new ObjectID()},
    {_id: a},
    {_id: b},
    {_id: c}
  ], function() {
    db.close();
  });

  // db.collection('t').findOne({id:1}, function(err, d) {
  //   console.log(d._id.getTimestamp())
  //   var i = new ObjectID("000000010000000000000001");
  //
  //   db.collection('t').insertOne({_id: i, id:2}, function(err, d) {
  //     console.log("=== timestamp :: " + i.getTimestamp().getTime())
  //     console.log("=== timestamp :: " + i.getTimestamp())
  //     db.close();
  //   });
  //   // var a = new ObjectId();
  //   // a.generationTime
  // });
});
