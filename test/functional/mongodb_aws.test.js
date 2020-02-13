'use strict';
const expect = require('chai').expect;

describe('MONGODB-AWS', function() {
  before(function() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI || MONGODB_URI.indexOf('MONGODB-AWS') === -1) {
      this.skip();
    }
  });

  it('should not authorize when not authenticated', function(done) {
    const config = this.configuration;
    const client = config.newClient(config.url()); // strip provided URI of credentials
    client.connect(err => {
      expect(err).to.not.exist;
      this.defer(() => client.close());

      client.db('aws').command({ count: 'test' }, (err, count) => {
        expect(err).to.exist;
        expect(count).to.not.exist;

        done();
      });
    });
  });

  it('should authorize when successfully authenticated', function(done) {
    const config = this.configuration;
    const client = config.newClient(); // use the URI built by the test environment
    client.connect(err => {
      expect(err).to.not.exist;
      this.defer(() => client.close());

      client.db('aws').command({ count: 'test' }, (err, count) => {
        expect(err).to.not.exist;
        expect(count).to.exist;

        done();
      });
    });
  });
});
