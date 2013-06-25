var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

Slave = function() {
  this.running = false;
  this.callbacks = [];
  //no native_parser right now (because timestamps)
  //no strict mode (because system db signed with $  db.js line 189)
  //connect without dbName for querying not only "local" db
  console.log("Connecting to " + host + ":" + port);
}

//start watching
Slave.prototype.start = function() {
  var self = this;
  if (this.running) return;
  
  MongoClient.connect(format("mongodb://%s:%s/testing?w=1", host, port), function(err, db) {
    if (err) {
      console.log('> MongoSlave error' + err);
      process.exit(1);
    }

    self.db = db;

    db.collection('local.oplog.$main', {strict: true}, function(err, collection) {
      if (! collection) {
        console.log('> MongoSlave - local.oplog.$main not found');
        db.close();
        self.stop();
        return false;
      }
      
      process.on('SIGINT', function () {
        self.stop(); //tailable cursor should be stopped manually
      });

      //get last row for init TS
      collection.find({}, {'limit': 1, 'sort': [['$natural', -1]]}).toArray(function(err, items) {
        if (items.length) {
          console.log('> MongoSlave started');
          self.running = true;
          self._runSlave(collection, items[0]['ts']);
        } else if (err) {
          console.log(err);
          self.stop();
        }
      });
    });
  });
}

//stop watching
Slave.prototype.stop = function() {
  if (!this.running) return;
  console.log('> MongoSlave stopped');
  this.running = false;
  this.db.close();
}

Slave.prototype._runSlave = function(collection, time) {

  var self = this;
  
  //watch oplog INFINITE (until Slave.stop())
  collection.find({'ts': {'$gt': time}}, {'tailable': 1, 'sort': [['$natural', 1]]}).each(function(err, item) {
    if (cursor.state == Cursor.CLOSED) { //broken cursor
      self.running && self._runSlave(collection, time);
      return;
    }
    time = item['ts'];

    switch(item['op']) {
      case 'i': //inserted
        self._emitObj(item['o']);
        break;
      case 'u': //updated
        self.db.collection(item['ns']).findOne(item['o2']['_id'], {}, function(err, item) {
          item && self._emitObj(item);
        });
        break;
      case 'd': //deleted
        //nothing to do
        break;
    }
  });
}

Slave.prototype._emitObj = function (obj) {
  for(var i in this.callbacks) this.callbacks[i].call(this, obj);
}

Slave.prototype.onObject = function(callback) {
  this.callbacks.push(callback);
}


//just for example
var watcher = new Slave();

watcher.onObject(function(obj) {
  console.dir(obj);
});

watcher.start();