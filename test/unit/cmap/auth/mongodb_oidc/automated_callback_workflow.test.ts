import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/gcp_machine_workflow';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TokenCache } from '../../../../../src/cmap/auth/mongodb_oidc/token_cache';
import {
  AutomatedCallbackWorkflow,
  CallbackWorkflow,
  Connection,
  MongoCredentials
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
        const workflow = new AutomatedCallbackWorkflow(cache, callback);

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
