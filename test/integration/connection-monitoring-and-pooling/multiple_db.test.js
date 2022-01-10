'use strict';
const { setupDatabase } = require('../shared');

describe('Multiple Databases', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests2']);
  });

  it('should not leak listeners', function (done) {
    var configuration = this.configuration;
    const client = configuration.newClient({}, { sslValidate: false });
    client.connect(function (err, client) {
      for (var i = 0; i < 100; i++) {
        client.db('test');
      }

      client.close(done);
    });
  });
});
