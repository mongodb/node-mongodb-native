"use strict"

var Benchmark = require('benchmark'),
  co = require('co'),
  f = require('util').format,
  MongoClient = require('../').MongoClient,
  ServerManager = require('mongodb-topology-manager').Server,
  Promise = global.Promise || require('mongodb-es6');

// Stand up a single mongodb instance
function globalSetup() {
  return new Promise(function(resolve, reject) {
    co(function*() {
      // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ -1")
      var manager = new ServerManager('mongod', {
        bind_ip: 'localhost', port: 27017,
        dbpath: f('%s/../db/27017', __dirname)
      })

      console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 0")
      // Purge the directory
      yield manager.purge();
      console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 1")
      // Start the server
      yield manager.start();
      console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 2")
      // Ready
      resolve(manager);
    }).catch(reject);
  });
}

// Connect to MongoDB
function getCollection(db, poolSize) {
  return new Promise(function(resolve, reject) {
    co(function*() {
      var r = yield MongoClient.connect(f('mongodb://localhost:27017/%s?maxPoolSize=%s', db, poolSize));
      resolve(r);
    }).catch(reject);
  });
}


co(function*() {
  console.log("----------- 0")
  // Get the connection to the server
  var manager = yield globalSetup();
  console.log("----------- 1")
  var db = yield getCollection('benchmark', 50);
  var collection = db.collection('single_inserts');
  console.log("----------- 2")

  // Simple insert test
  var suite = new Benchmark.Suite;

  // Add a simple document insert
  suite.add('Simple single document insert', {
    defer: true,
    fn: function(deferred) {
      collection.insertOne({a:1}, function() {
        deferred.resolve();
      });
    }
  });

  suite.on('cycle', function(event) {
    // console.log("---------------------------------------- cycle ended");
    // console.dir(event)
    // console.log(String(bench));
  });

  suite.on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').pluck('name'));

    console.dir(this[0].stats)

    // Close down the connection
    db.close().then(function() {});
    // Stop the server
    manager.stop().then(function() {});
  })

  // run async
  suite.run({ 'async': true });
}).catch(function(e) {
  console.log(e.stack);
});
