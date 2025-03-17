import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, GCPMachineWorkflow, MongoCredentials, TokenCache } from '../../../../mongodb';

describe('GCPMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new GCPMachineWorkflow({ io: {} }, new TokenCache());

    context('when TOKEN_RESOURCE is not set', function () {
      it('throws an error', async function () {
        const connection = sinon.createStubInstance(Connection);
        const credentials = sinon.createStubInstance(MongoCredentials);
        connection.parent = { client: { io: {} } };
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
          workflow = new GCPMachineWorkflow({ io: {} }, cache);
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
