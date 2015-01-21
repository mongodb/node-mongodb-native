"use strict";

var mongodb = require('../../.')
  , Db = mongodb.Db
  , f = require('util').format
  , Server = mongodb.Server
  , Binary = mongodb.Binary
  , MongoClient = mongodb.MongoClient;

var single_doc_insert = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          callback();
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('single_doc_insert').insert({a:1}, callback);
      }
    }
  }
}

var single_doc_insert_journal = function(connection_string) {
  return function() {
    return {
      db: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;
        connection_string = f('%s?journal=true', connection_string);

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          callback();
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('single_doc_insert').insert({a:1}, callback);
      }
    }
  }
}


var single_100_simple_insert = function(connection_string) {
  return function() {
    return {
      db: null,
      docs: [],

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;

          for(var i = 0; i < 100; i++) {
            self.docs.push({a:1, b: i, string: 'hello world', bin: new Buffer(256)})
          }

          callback();
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('single_100_simple_insert').insert(this.docs, callback);
      }
    }
  }
}

exports.single_doc_insert = single_doc_insert;
exports.single_100_simple_insert = single_100_simple_insert;
exports.single_doc_insert_journal = single_doc_insert_journal;