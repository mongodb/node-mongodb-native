import { expect } from 'chai';

import { type Collection, MongoClient, type MongoClientOptions } from '../../../src';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';

describe('OIDC Auth Spec Azure Tests', function () {
  describe('5. Azure Tests', function () {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(function () {
      if (!this.configuration.isOIDC(process.env.MONGODB_URI_SINGLE, 'azure')) {
        this.skipReason = 'Azure OIDC tests require an Azure OIDC environment.';
        this.skip();
      }
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('5.1 Azure With No Username', function () {
      // Create an OIDC configured client with ENVIRONMENT:azure and a valid TOKEN_RESOURCE and no username.
      // Perform a find operation that succeeds.
      // Close the client.
      beforeEach(function () {
        const options: MongoClientOptions = {};
        if (process.env.AZUREOIDC_RESOURCE) {
          options.authMechanismProperties = { TOKEN_RESOURCE: process.env.AZUREOIDC_RESOURCE };
        }
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, options);
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.not.be.null;
      });
    });

    describe('5.2 Azure With Bad Username', function () {
      // Create an OIDC configured client with ENVIRONMENT:azure and a valid TOKEN_RESOURCE and a username of "bad".
      // Perform a find operation that fails.
      // Close the client.
      beforeEach(function () {
        const options: MongoClientOptions = {};
        if (process.env.AZUREOIDC_USERNAME) {
          options.auth = { username: 'bad', password: undefined };
        }
        if (process.env.AZUREOIDC_RESOURCE) {
          options.authMechanismProperties = { TOKEN_RESOURCE: process.env.AZUREOIDC_RESOURCE };
        }
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, options);
        collection = client.db('test').collection('test');
      });

      it('does not authenticate', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error.message).to.include('Azure endpoint');
      });
    });

    describe('5.3 Azure With Valid Username', function () {
      // This prose test does not exist in the spec but the new OIDC setup scripts
      // have a username in the environment so worth testing.
      beforeEach(function () {
        const options: MongoClientOptions = {};
        if (process.env.AZUREOIDC_USERNAME) {
          options.auth = { username: process.env.AZUREOIDC_USERNAME, password: undefined };
        }
        if (process.env.AZUREOIDC_RESOURCE) {
          options.authMechanismProperties = { TOKEN_RESOURCE: process.env.AZUREOIDC_RESOURCE };
        }
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
