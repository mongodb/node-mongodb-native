import { expect } from 'chai';

import { type Collection, type MongoClient } from '../../mongodb';

describe('OIDC Auth Spec GCP Tests', function () {
  describe('GCP Automatic Auth', function () {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(function () {
      if (!this.configuration.isOIDC(process.env.MONGODB_URI, 'gcp')) {
        this.skipReason = 'GCP OIDC prose tests require a GCP OIDC environment.';
        this.skip();
      }
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('Connect', function () {
      beforeEach(function () {
        client = this.configuration.newClient(process.env.MONGODB_URI);
        collection = client.db('test').collection('test');
      });

      // Assert that a find operation succeeds.
      // Close the client.
      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.not.be.null;
      });
    });
  });
});
