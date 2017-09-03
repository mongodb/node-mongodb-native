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
        promises: true,
        node: '>0.8.0',
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var url = configuration.url();
      url =
        url.indexOf('?') != -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      MongoClient.connect(url).then(function(client) {
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
