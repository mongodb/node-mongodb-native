"use strict";

var mongodb = require('../../.')
  , Server = mongodb.Server;

var simple_100_document_toArray = function(connection_string) {
  return function() {
    return {
      server: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        var server = new Server({host: 'localhost', port: 27017});
        server.on('connect', function(server) {
          self.server = server;

          // Drop collection
          server.command('test.$cmd', {drop: 'test'}, function(err) {

            // Create 100 documents
            var docs = [];
            for(var i = 0; i < 100; i++) docs.push({a:1, b:'hello world', c:1});
            server.insert('test.test', docs, {w:1}, callback);
          });
        });

        server.connect();
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.server != null) this.server.destroy();
        callback();
      },

      // Actual operation we are measuring
      test: function(callback) {
        // console.log("--------- 0")
        // Execute find
        var cursor = this.server.cursor('test.test', {
            find: 'test.test'
          , query: {}
        });
        // console.log("--------- 1")
        cursor.next(function(doc) {
        // console.log("--------- 2")
          callback();
        });
      }
    }
  }
}

var simple_2_document_limit_toArray = function(connection_string) {
  return function() {
    return {
      server: null,

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        var server = new Server({host: 'localhost', port: 27017});
        server.on('connect', function(server) {
          self.server = server;

          // Drop collection
          server.command('test.$cmd', {drop: 'test'}, function(err) {

            // Create 100 documents
            var docs = [];
            for(var i = 0; i < 1000; i++) docs.push({a:1, b:'hello world', c:1});
            server.insert('test.test', docs, {w:1}, callback);
          });
        });

        server.connect();
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.server != null) this.server.destroy();
        callback();
      },

      // Actual operation we are measuring
      test: function(callback) {
        // console.log("--------- 0")
        // Execute find
        var cursor = this.server.cursor('test.test', {
            find: 'test.test'
          , query: {}
          , limit: 2
        });
        // console.log("--------- 1")
        cursor.next(function(doc) {
          cursor.next(function(doc) {
        // console.log("--------- 2")
            callback();
          });
        });
      }
    }
  }
}

// exports.simple_100_document_toArray = simple_100_document_toArray;
exports.simple_2_document_limit_toArray = simple_2_document_limit_toArray;
