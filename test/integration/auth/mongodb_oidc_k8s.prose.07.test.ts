import * as process from 'node:process';

import { expect } from 'chai';

import { type Collection, MongoClient } from '../../../src';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';

describe('OIDC Auth Spec K8s Tests', function () {
  // Note there is no spec or tests for K8s, and it's optional to run the entire
  // machine prose tests on the additional environments so we do 1 sanity check
  // here. This same test will run in CI on AKS, EKS, and GKE.
  describe('7. K8s Tests', function () {
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
