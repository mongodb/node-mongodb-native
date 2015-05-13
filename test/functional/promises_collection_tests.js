"use strict";

var f = require('util').format;

exports['Should correctly execute Collection.prototype.insertOne'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1 
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

      console.log("========================================================= 0")

    MongoClient.connect(url).then(function(db) {
      test.equal(100, db.serverConfig.connections().length);

      console.log("=========================================================")

      db.collection('insertOne').insertOne({a:1}).then(function(r) {

        db.close();
        test.done();
      });
    });
  }
}
