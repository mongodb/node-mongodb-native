var mongodb = require("./"),
  CoreConnection = mongodb.CoreConnection,
  CoreServer = mongodb.CoreServer;

var uri = "mongodb://c649.candidate.63.mongolayer.com:10649,c491.candidate.64.mongolayer.com:10491/app?replicaSet=set-56be39f36887897ebf0037db";
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
    console.dir(err)
  });
