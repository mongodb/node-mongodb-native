"use strict";

var mongodb = require("./");

var servers = [
  "replicaset-shard-00-00-oztdp.mongodb-dev.net:27017",
  "replicaset-shard-00-01-oztdp.mongodb-dev.net:27017",
  "replicaset-shard-00-02-oztdp.mongodb-dev.net:27017"
];

var servers = [
  "shardedcluster-shard-00-00-oztdp.mongodb-dev.net:37017"
]

var servers = [
  "52.202.234.49:27017"
]

var uri = `mongodb://${servers.join(',')}/admin?ssl=true`

var MongoClient = mongodb.MongoClient;
console.log(uri)
MongoClient.connect(uri, function(err, db) {
  console.log("---------------------------------------")
  console.log(err)
  console.log(db)
});
