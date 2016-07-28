var mongodb = require("./"),
  CoreConnection = mongodb.CoreConnection,
  CoreServer = mongodb.CoreServer;

var uri = "mongodb://foo:bar@ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331/driver-test?replicaSet=rs-ds021331";
// mongostat -u foo -p bar --authenticationDatabase driver-test --host rs-ds021331/ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331 --discover
var options = {server: {socketOptions: {connectTimeoutMS: 5000, socketTimeoutMS: 15000}}}
var interval = 100;
var total = 1000;

// console.dir(CoreConnection)
CoreConnection.enableConnectionAccounting();
CoreServer.enableServerAccounting();

var openThenClose = function(count){
  var MongoClient = mongodb.MongoClient;

  MongoClient.connect(uri, options, function(err, db) {
    if (err) {
      console.error(Date() + " " + err)
    } else {
      console.error(Date() + " open :: " + count);
      var descriptors = db.collection("some-collection").find();
      descriptors.toArray(function(err, docs){
        console.error(Date() + " found " + docs.length + " docs")
        db.close(function(){
          console.error(Date() + " close :: " + count);
        });
      });
    }
  });
};

var count = total;
// console.error(Date() + " starting up")
var intervalId = setInterval(function(){
  count = count - 1;

  if(count == 0) {
    clearInterval(intervalId);
    setTimeout(function() {
      CoreConnection.disableConnectionAccounting();
      CoreServer.disableServerAccounting();
      console.log("============================= connections left")
      console.dir(Object.keys(CoreConnection.connections()));
      console.dir(Object.keys(CoreServer.servers()));
    }, 5000);
  } else {
    openThenClose(count);
  }
}, interval);
