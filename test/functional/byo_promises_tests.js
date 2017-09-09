'use strict';
var expect = require('chai').expect;

describe('BYO Promises', function() {
  it('should Correctly Use Blurbird promises library', {
    metadata: {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var MongoClient = self.configuration.require.MongoClient;
      var Promise = require('bluebird');

      MongoClient.connect(self.configuration.url(), {
        promiseLibrary: Promise,
        sslValidate: false
      }).then(function(client) {
        var db = client.db(self.configuration.db);
        var promise = db.collection('test').insert({ a: 1 });
        expect(promise).to.be.an.instanceOf(Promise);

        promise.then(function() {
          client.close();
          done();
        });
      });
    }
  });
});
