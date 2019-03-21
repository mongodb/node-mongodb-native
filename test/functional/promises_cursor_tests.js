'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var f = require('util').format;

describe('Promises (Cursor)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should correctly execute Collection.prototype.insertOne as promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect().then(function(client) {
        var db = client.db(configuration.db);
        test.equal(1, client.topology.connections().length);

        db
          .collection('insertOne')
          .insertOne({ a: 1 })
          .then(function() {
            client.close();
            done();
          });
      });
    }
  });
});
