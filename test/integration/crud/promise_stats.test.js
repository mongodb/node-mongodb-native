'use strict';
const { assert: test, setupDatabase } = require('../shared');
const f = require('util').format;

describe('stats', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it(
    'Should correctly execute stats using Promise',
    {
      requires: {
        topology: ['single']
      }
    },
    function (done) {
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
  );
});
