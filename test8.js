var mongodb = require('./');

var uri = "mongodb://foo:bar@ds021331-a0.mlab.com:21331,ds021331-a1.mlab.com:21331/driver-test?replicaSet=rs-ds021331";
var interval = 1000;

var openThenClose = function(){
    var MongoClient = mongodb.MongoClient;
    MongoClient.connect(uri, function(err, db) {
        console.log("open");
        var descriptors = db.collection("some-collection").find();
        descriptors.toArray(function(err, docs){
            db.close(function(){
                console.log("close");
            });
        });
    });
};

setInterval(function(){
    openThenClose();
}, interval);
