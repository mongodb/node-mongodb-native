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
      const configuration = this.configuration;
      var Promise = require('bluebird');

      const client = configuration.newClient(
        {},
        {
          promiseLibrary: Promise,
          sslValidate: false
        }
      );

      client.connect().then(function(client) {
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
