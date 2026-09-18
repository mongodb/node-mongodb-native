import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  AutomatedCallbackWorkflow,
  CallbackWorkflow,
  Connection,
  gcpCallback,
  MongoCredentials,
  type OIDCCallbackParams,
  type OIDCResponse,
  TokenCache
} from '../../../../mongodb';
import { sleep } from '../../../../tools/utils';

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

  describe('#callback', function () {
    // The callback is wrapped in CallbackWorkflow's withLock(), which serializes
    // invocations. See NODE-7858: a rejected callback used to leave the lock
    // holding the rejection, so every later caller failed with the first
    // caller's error and the callback was never invoked again.
    const params = { timeoutContext: new AbortController().signal, version: 1 as const };

    context('when a lone callback invocation rejects', function () {
      it('invokes the callback again for the next caller', async function () {
        const callback = sinon.stub<[OIDCCallbackParams], Promise<OIDCResponse>>();
        callback.onFirstCall().rejects(new Error('metadata timed out'));
        callback.resolves({ accessToken: 'token' });
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        const error = await locked(params).catch(error => error);
        expect(error).to.match(/metadata timed out/);

        const result = await locked(params);
        expect(result).to.deep.equal({ accessToken: 'token' });
        expect(callback).to.have.been.calledTwice;
      });
    });

    context('when a caller is queued behind a rejecting callback', function () {
      it('invokes the callback for the queued caller instead of reusing the error', async function () {
        const callback = sinon.stub<[OIDCCallbackParams], Promise<OIDCResponse>>();
        callback.onFirstCall().callsFake(async () => {
          await sleep(50);
          throw new Error('metadata timed out');
        });
        callback.resolves({ accessToken: 'token' });
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        const first = locked(params).catch(error => error);
        // The queued caller arrives while the first is still in flight, but late
        // enough that it sees the lock the first caller installed.
        await sleep(10);
        const queued = locked(params).catch(error => error);

        expect(await first).to.match(/metadata timed out/);
        expect(await queued).to.deep.equal({ accessToken: 'token' });
      });
    });

    context('when callers overlap', function () {
      it('never runs the callback concurrently', async function () {
        let running = 0;
        let maxRunning = 0;
        const callback = sinon
          .stub<[OIDCCallbackParams], Promise<OIDCResponse>>()
          .callsFake(async () => {
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            await sleep(10);
            running -= 1;
            return { accessToken: 'token' };
          });
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        await Promise.all([locked(params), locked(params), locked(params)]);

        expect(maxRunning).to.equal(1);
        expect(callback).to.have.been.calledThrice;
      });
    });

    context('when a callback rejects', function () {
      it('still throttles the next invocation', async function () {
        const invokedAt: number[] = [];
        const callback = sinon
          .stub<[OIDCCallbackParams], Promise<OIDCResponse>>()
          .callsFake(async () => {
            invokedAt.push(Date.now());
            throw new Error('metadata timed out');
          });
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        await locked(params).catch(() => null);
        await locked(params).catch(() => null);

        expect(callback).to.have.been.calledTwice;
        // withLock throttles invocations to one per 100ms.
        expect(invokedAt[1] - invokedAt[0]).to.be.at.least(90);
      });
    });
  });
});
