// var inherits = require('util').inherits
var Db = require('./db').Db;

var MongoClient = function MongoClient(serverConfig, options) {
  options = options == null ? {} : options;
  // If no write concern is set set the default to w:1
  if(options != null && !options.safe && !options.journal && !options.w && !options.fsync) {    
    options.w = 1;
  }

  // The internal db instance we are wrapping
  var _db = new Db('test', serverConfig, options);
  // Self reference
  var self = this;

  // Open command for the MongoClient
  MongoClient.prototype.open = function(callback) {  
    _db.open(function(err, db) {
      if(err) return callback(err, null);
      callback(null, self);
    })
  }

  // Close command for the MongoClient
  MongoClient.prototype.close = function(callback) {  
    _db.close(callback);
  }

  // Get a db object
  MongoClient.prototype.db = function(dbName) {  
    return _db.db(dbName);
  }
}

MongoClient.connect = function(url, options, callback) {  
  Db.connect(url, options, function(err, db) {
    if(err) return callback(err, null);
    // If no write concern is set set the default to w:1
    if(db.options != null && !db.options.safe && !db.options.journal && !db.options.w && !db.options.fsync) {    
      db.options.w = 1;
    }
    // Return the db
    callback(null, db);
  });
}

exports.MongoClient = MongoClient;