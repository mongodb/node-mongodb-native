'use strict';
const { expect } = require('chai');
const { removeAuthFromConnectionString } = require('../../tools/utils');
const sinon = require('sinon');
const http = require('http');
const { performance } = require('perf_hooks');
const { MongoAWSError } = require('../../../src');

describe('MONGODB-AWS', function () {
  beforeEach(function () {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI || MONGODB_URI.indexOf('MONGODB-AWS') === -1) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-AWS auth mechanism';
      this.skip();
    }
  });

  it('should not authorize when not authenticated', function (done) {
    const config = this.configuration;
    const url = removeAuthFromConnectionString(config.url());
    const client = config.newClient(url); // strip provided URI of credentials
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

  it('should authorize when successfully authenticated', function (done) {
    const config = this.configuration;
    const client = config.newClient(process.env.MONGODB_URI); // use the URI built by the test environment
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

  it('should allow empty string in authMechanismProperties.AWS_SESSION_TOKEN to override AWS_SESSION_TOKEN environment variable', function () {
    const client = this.configuration.newClient(this.configuration.url(), {
      authMechanismProperties: { AWS_SESSION_TOKEN: '' }
    });
    expect(client)
      .to.have.nested.property('options.credentials.mechanismProperties.AWS_SESSION_TOKEN')
      .that.equals('');
  });

  describe('EC2 with missing credentials', () => {
    let client;

    beforeEach(function () {
      if (!process.env.IS_EC2) {
        this.currentTest.skipReason = 'requires an AWS EC2 environment';
        this.skip();
      }
      sinon.stub(http, 'request').callsFake(function () {
        arguments[0].hostname = 'www.example.com';
        arguments[0].port = 81;
        return http.request.wrappedMethod.apply(this, arguments);
      });
    });

    afterEach(async () => {
      sinon.restore();
      if (client) {
        await client.close();
      }
    });

    it('should respect the default timeout of 10000ms', async function () {
      const config = this.configuration;
      client = config.newClient(process.env.MONGODB_URI, { authMechanism: 'MONGODB-AWS' }); // use the URI built by the test environment
      const startTime = performance.now();

      let caughtError = null;
      await client.connect().catch(err => {
        caughtError = err;
      });

      const endTime = performance.now();
      const timeTaken = endTime - startTime;
      expect(caughtError).to.be.instanceOf(MongoAWSError);
      expect(caughtError)
        .property('message')
        .match(/timed out after/);
      expect(timeTaken).to.be.within(10000, 12000);
    });
  });
});
