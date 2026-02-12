import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  AutomatedCallbackWorkflow,
  CallbackWorkflow,
  Connection,
  gcpCallback,
  MongoCredentials,
  TokenCache
} from '../../../../mongodb';

describe('AutomatedCallbackWorkflow', function () {
  describe('#execute', function () {
    context('when the cache has a token', function () {
      const sandbox = sinon.createSandbox();

      // See NODE-6801 and corresponding PR: https://github.com/mongodb/node-mongodb-native/pull/4438
      // This is a test to ensure that we do not regress on the above issue. Do NOT remove this test.
      context('when the connection has no token', function () {
        const cache = new TokenCache();
        const connection = sandbox.createStubInstance(Connection);
        const credentials = sandbox.createStubInstance(MongoCredentials);
        sandbox.stub(CallbackWorkflow.prototype, 'finishAuthentication').resolves();
        const workflow = new AutomatedCallbackWorkflow(cache, gcpCallback);

        beforeEach(function () {
          cache.put({ accessToken: 'test', expiresInSeconds: 7200 });
          workflow.execute(connection, credentials);
        });

        afterEach(function () {
          sandbox.restore();
        });

        it('sets the token on the connection', async function () {
          expect(connection.accessToken).to.equal('test');
        });
      });
    });
  });
});
