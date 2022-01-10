'use strict';

const { assert: test, setupDatabase } = require('../shared');
const f = require('util').format;

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('stats', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly execute stats using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        client
          .db(configuration.db)
          .stats()
          .then(function (stats) {
            test.ok(stats != null);

            client.close(done);
          });
      });
    }
  });
});
