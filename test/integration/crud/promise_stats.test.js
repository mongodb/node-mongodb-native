'use strict';

const { assert: test, setupDatabase } = require('../shared');
const f = require('util').format;

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

    test: async function () {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      await client.connect();
      const stats = await client.db(configuration.db).stats();
      test.notEqual(null, stats);
      await client.close();
    }
  });
});
