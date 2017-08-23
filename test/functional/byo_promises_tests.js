'use strict';

var f = require('util').format;

exports['Should Correctly Use Blurbird promises library'] = {
  metadata: {
    requires: {
      topology: ['single', 'ssl', 'wiredtiger']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Promise = require('bluebird');

    MongoClient.connect(configuration.url(), {
      promiseLibrary: Promise,
      server: { sslValidate: false }
    }).then(function(client) {
      var db = client.db(configuration.database);
      var promise = db.collection('test').insert({ a: 1 });
      test.ok(promise instanceof Promise);

      promise.then(function() {
        client.close();
        test.done();
      });
    });
  }
};
