"use strict";

var mongodb = require('../../.')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , Binary = mongodb.Binary
  , MongoClient = mongodb.MongoClient;

var single_doc_upsert = function(connection_string) {
  return function() {
    return {
      db: null,
      i: 0,

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
        this.db.collection('single_doc_upsert').update({a:this.i++}, {$set: {b: 1}}, {upsert:true}, callback);
      }
    }
  }
}

exports.single_doc_upsert = single_doc_upsert;
