import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { AutomatedCallbackWorkflow } from '../../../../../src/cmap/auth/mongodb_oidc/automated_callback_workflow';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/gcp_machine_workflow';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TokenCache } from '../../../../../src/cmap/auth/mongodb_oidc/token_cache';
import { Connection, MongoCredentials } from '../../../../mongodb';

describe('AutomatedCallbackWorkflow', function () {
  describe('#execute', function () {
    context('when the cache has a token', function () {
      context('when the connection has no token', function () {
        const cache = new TokenCache();
        const connection = sinon.createStubInstance(Connection);
        const credentials = sinon.createStubInstance(MongoCredentials);
        const workflow = new AutomatedCallbackWorkflow(cache, callback);
        sinon.stub(workflow, 'finishAuthentication').returns(Promise.resolve());

        beforeEach(function () {
          cache.put({ accessToken: 'test', expiresInSeconds: 7200 });
          workflow.execute(connection, credentials);
        });

        afterEach(function () {
          sinon.restore();
        });

        it('sets the token on the connection', async function () {
          expect(connection.accessToken).to.equal('test');
        });
      });
    });
  });
});
