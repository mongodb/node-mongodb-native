'use strict';
const { setupDatabase } = require('../shared');
const f = require('util').format;

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('MongoClient integration', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly connect with MongoClient `connect` using Promise', function () {
    var configuration = this.configuration;
    var url = configuration.url();
    url =
      url.indexOf('?') !== -1
        ? f('%s&%s', url, 'maxPoolSize=100')
        : f('%s?%s', url, 'maxPoolSize=100');

    const client = configuration.newClient(url);
    return client.connect().then(() => client.close());
  });
});
