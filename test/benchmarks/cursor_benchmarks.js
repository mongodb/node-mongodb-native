"use strict";

var mongodb = require('../../.')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , MongoClient = mongodb.MongoClient;

var simple_100_document_toArray = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
    
          // Drop the collection
          db.collection('simple_100_document_toArray').drop(function(err, result) {
            // Create 100 documents
            var docs = [];
            for(var i = 0; i < 100; i++) docs.push({a:1, b:'hello world', c:1});
            // Setup the 100 documents
            db.collection('simple_100_document_toArray').insert(docs, {w:1}, callback);  
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('simple_100_document_toArray').find().toArray(callback);
      }
    }
  }
}

var simple_2_document_limit_toArray = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
    
          // Drop the collection
          db.collection('simple_2_document_limit_toArray').drop(function(err, result) {
            // Create 100 documents
            var docs = [];
            for(var i = 0; i < 1000; i++) docs.push({a:1, b:'hello world', c:1});
            // Setup the 100 documents
            db.collection('simple_2_document_limit_toArray').insert(docs, {w:1}, callback);  
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('simple_100_document_toArray').find({}, {limit:2}).toArray(callback);
      }
    }
  }
}

var A = function() {
  this.execute = function() {    
  }
}

var B = function() {}
B.prototype.execute = function() {}

var simple_public_method_bench = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        callback()
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        callback()
      },

      // Actual operation we are measuring
      test: function(callback) {
        new A().execute();
        callback()
      }
    }
  }
}

var simple_protected_method_bench = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        callback()
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        callback()
      },

      // Actual operation we are measuring
      test: function(callback) {
        new B().execute();
        callback()
      }
    }
  }
}

// exports.simple_100_document_toArray = simple_100_document_toArray;
exports.simple_2_document_limit_toArray = simple_2_document_limit_toArray;
// exports.simple_protected_method_bench = simple_protected_method_bench;
// exports.simple_public_method_bench = simple_public_method_bench;
