import { expect } from 'chai';
import * as http from 'http';
import { performance } from 'perf_hooks';
import * as sinon from 'sinon';

import { MongoAWSError, MongoClient, MongoServerError } from '../../mongodb';
import { removeAuthFromConnectionString } from '../../tools/utils';

describe('MONGODB-AWS', function () {
  let client: MongoClient;
  beforeEach(function () {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI || MONGODB_URI.indexOf('MONGODB-AWS') === -1) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-AWS auth mechanism';
      this.skip();
    }
  });

  afterEach(async () => {
    await client?.close();
  });

  it('should not authorize when not authenticated', async function () {
    const url = removeAuthFromConnectionString(this.configuration.url());
    client = this.configuration.newClient(url); // strip provided URI of credentials

    const error = await client
      .db('aws')
      .collection('aws_test')
      .estimatedDocumentCount()
      .catch(error => error);

    expect(error).to.be.instanceOf(MongoServerError);
    expect(error).to.have.property('code', 13);
  });

  it('should authorize when successfully authenticated', async function () {
    client = this.configuration.newClient(process.env.MONGODB_URI); // use the URI built by the test environment

    const result = await client
      .db('aws')
      .collection('aws_test')
      .estimatedDocumentCount()
      .catch(error => error);

    expect(result).to.not.be.instanceOf(MongoServerError);
    expect(result).to.be.a('number');
  });

  it('should allow empty string in authMechanismProperties.AWS_SESSION_TOKEN to override AWS_SESSION_TOKEN environment variable', function () {
    client = this.configuration.newClient(this.configuration.url(), {
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
      sinon.stub(http, 'request').callsFake(function (...args) {
        // We pass in a legacy object that has the same properties as a URL
        // but it is not an instanceof URL.
        expect(args[0]).to.be.an('object');
        if (typeof args[0] === 'object') {
          args[0].hostname = 'www.example.com';
          args[0].port = '81';
        }
        return http.request.wrappedMethod.apply(this, args);
      });
    });

    afterEach(async () => {
      sinon.restore();
      await client?.close();
    });

    it('should respect the default timeout of 10000ms', async function () {
      const config = this.configuration;
      client = config.newClient(process.env.MONGODB_URI, { authMechanism: 'MONGODB-AWS' }); // use the URI built by the test environment
      const startTime = performance.now();

      const caughtError = await client
        .db()
        .command({ ping: 1 })
        .catch(error => error);

      const endTime = performance.now();
      const timeTaken = endTime - startTime;
      expect(caughtError).to.be.instanceOf(MongoAWSError);
      expect(caughtError)
        .property('message')
        .match(/(timed out after)|(Could not load credentials)/);
      // Credentials provider from the SDK does not allow to configure the timeout
      // and defaults to 2 seconds - so we ensure this timeout happens below 12s
      // instead of the 10s-12s range previously.
      expect(timeTaken).to.be.below(12000);
    });
  });
});
