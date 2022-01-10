'use strict';
const { assert: test, setupDatabase } = require('../shared');
const f = require('util').format;
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('Handshake', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly execute legacy hello command using Promise', {
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
        // Execute legacy hello command
        client
          .db(configuration.db)
          .command({ [LEGACY_HELLO_COMMAND]: true })
          .then(function (result) {
            test.ok(result !== null);

            client.close(done);
          });
      });
    }
  });
});
