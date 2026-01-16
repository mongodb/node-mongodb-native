import { expect } from 'chai';
import * as process from 'process';

import { type Collection, MongoClient, type MongoClientOptions } from '../../../src';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';

describe('OIDC Auth Spec GCP Tests', function () {
  // Note there is no spec or tests for GCP yet, these are 2 scenarios based on the
  // drivers tools scripts available.
  describe('6. GCP Tests', function () {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(function () {
      if (!this.configuration.isOIDC(process.env.MONGODB_URI_SINGLE, 'gcp')) {
        this.skipReason = 'GCP OIDC prose tests require a GCP OIDC environment.';
        this.skip();
      }
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('6.1 GCP With Valid Token Resource', function () {
      beforeEach(function () {
        const options: MongoClientOptions = {};
        if (process.env.GCPOIDC_AUDIENCE) {
          options.authMechanismProperties = { TOKEN_RESOURCE: process.env.GCPOIDC_AUDIENCE };
        }
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, options);
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.not.be.null;
      });
    });

    describe('6.2 GCP With Invalid Token Resource', function () {
      beforeEach(function () {
        const options: MongoClientOptions = { authMechanismProperties: { TOKEN_RESOURCE: 'bad' } };
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, options);
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.not.be.null;
      });
    });
  });
});
