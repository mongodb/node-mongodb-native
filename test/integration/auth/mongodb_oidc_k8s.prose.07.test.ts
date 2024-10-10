import { expect } from 'chai';

import { type Collection, MongoClient } from '../../mongodb';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';

describe('OIDC Auth Spec K8s Tests', function () {
  // Note there is no spec or tests for GCP yet, these are 2 scenarios based on the
  // drivers tools scripts available.
  describe('6. GCP Tests', function () {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(function () {
      if (!this.configuration.isOIDC(process.env.MONGODB_URI_SINGLE, 'k8s')) {
        this.skipReason = 'K8s OIDC prose tests require a K8s OIDC environment.';
        this.skip();
      }
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('7.1 K8s With Environment Set', function () {
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI);
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.not.be.null;
      });
    });
  });
});
