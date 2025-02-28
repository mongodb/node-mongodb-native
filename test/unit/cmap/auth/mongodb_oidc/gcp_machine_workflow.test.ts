import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TokenCache } from '../../../../../src/cmap/auth/mongodb_oidc/token_cache';
import { Connection, GCPMachineWorkflow, MongoCredentials } from '../../../../mongodb';

describe('GCPMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new GCPMachineWorkflow(new TokenCache());

    context('when TOKEN_RESOURCE is not set', function () {
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      it('throws an error', async function () {
        const error = await workflow.execute(connection, credentials).catch(error => error);
        expect(error.message).to.include('TOKEN_RESOURCE');
      });
    });
  });

  describe('#getTokenFromCacheOrEnv', function () {
    context('when the cache has a token', function () {
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      context('when the connection has no token', function () {
        let cache;
        let workflow;

        this.beforeEach(function () {
          cache = new TokenCache();
          cache.put({ accessToken: 'test', expiresInSeconds: 7200 });
          workflow = new GCPMachineWorkflow(cache);
        });

        it('sets the token on the connection', async function () {
          const token = await workflow.getTokenFromCacheOrEnv(connection, credentials);
          expect(token).to.equal('test');
          expect(connection.accessToken).to.equal('test');
        });
      });
    });
  });
});
