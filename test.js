var mongodb = require("./");
/*
db.createUser( {
    user: "root",
    pwd: "root",
    roles: [ { role: "root", db: "admin" } ]
  });
*/
// var uri = "mongodb://muser:mpass@ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331/mdb?replicaSet=rs-ds021331";
// var uri = "mongodb://root:root@localhost:31000,localhost:31001/admin?replicaSet=rs";
// var uri = "mongodb://foo:bar@ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331/driver-test?replicaSet=rs-ds021331";
var uri = "mongodb://root:root@localhost:27017/admin?socketTimeoutMS=5000&connectTimeoutMS=5000";
var interval = 1000;
var index = 0;
var total = 1000;

var openThenClose = function(){
  var i = index;
  var MongoClient = mongodb.MongoClient;
  MongoClient.connect(uri, function(err, db) {
    if(!err) {
      console.log("open " + i);
      var descriptors = db.db('test').collection("some-collection").find();
      descriptors.toArray(function(err, docs){
        db.close(function(){
          console.log("close " + i);
        });
      });
    }
  });
};

// Run interval total times
var intervalId = setInterval(function(){
  index = index + 1;

  if(index > total) {
    return clearInterval(intervalId);
  }

  openThenClose();
}, interval);

// keep alive
setInterval(function(){
}, interval * 10)
