"use strict";

var mongodb = require('../../.')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , Binary = mongodb.Binary
  , MongoClient = mongodb.MongoClient;

var single_doc_remove = function(connection_string) {
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
          var bulk = self.db.collection('single_doc_remove').initializeUnorderedBulkOp();          

          for(var i = 0; i < 10000; i++) {
            bulk.insert({a:i});
          }

          bulk.execute(callback);
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        this.db.collection('single_doc_remove').remove({a:this.i++}, callback);
      }
    }
  }
}

exports.single_doc_remove = single_doc_remove;
