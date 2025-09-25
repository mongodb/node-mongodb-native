import { expect } from 'chai';
import * as sinon from 'sinon';

import { MongoCredentials } from '../../../../../src/cmap/auth/mongo_credentials';
import { AutomatedCallbackWorkflow } from '../../../../../src/cmap/auth/mongodb_oidc/automated_callback_workflow';
import { CallbackWorkflow } from '../../../../../src/cmap/auth/mongodb_oidc/callback_workflow';
import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/gcp_machine_workflow';
import { TokenCache } from '../../../../../src/cmap/auth/mongodb_oidc/token_cache';
import { Connection } from '../../../../../src/cmap/connection';

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
