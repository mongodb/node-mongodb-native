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

    function countingCallback(failOn: number[]) {
      let invocations = 0;
      const callback = async () => {
        invocations += 1;
        if (failOn.includes(invocations)) {
          throw new Error(`rejected on invocation ${invocations}`);
        }
        return { accessToken: `token-${invocations}` };
      };
      return {
        callback,
        get invocations() {
          return invocations;
        }
      };
    }

    context('when a lone callback invocation rejects', function () {
      it('invokes the callback again for the next caller', async function () {
        const spy = countingCallback([1]);
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), spy.callback).callback;

        const error = await locked(params).catch(error => error);
        expect(error).to.match(/rejected on invocation 1/);

        const result = await locked(params);
        expect(result).to.deep.equal({ accessToken: 'token-2' });
        expect(spy.invocations).to.equal(2);
      });
    });

    context('when a caller is queued behind a rejecting callback', function () {
      it('invokes the callback for the queued caller instead of reusing the error', async function () {
        let invocations = 0;
        const callback = async () => {
          invocations += 1;
          if (invocations === 1) {
            await sleep(50);
            throw new Error('rejected on invocation 1');
          }
          return { accessToken: `token-${invocations}` };
        };
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        const first = locked(params).catch(error => error);
        // The queued caller arrives while the first is still in flight, but late
        // enough that it sees the lock the first caller installed.
        await sleep(10);
        const queued = locked(params).catch(error => error);

        expect(await first).to.match(/rejected on invocation 1/);
        expect(await queued).to.deep.equal({ accessToken: 'token-2' });
      });
    });

    context('when callers overlap', function () {
      it('never runs the callback concurrently', async function () {
        let running = 0;
        let maxRunning = 0;
        const callback = async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await sleep(10);
          running -= 1;
          return { accessToken: 'token' };
        };
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        await Promise.all([locked(params), locked(params), locked(params)]);

        expect(maxRunning).to.equal(1);
      });
    });

    context('when a callback rejects', function () {
      it('still throttles the next invocation', async function () {
        const timestamps: number[] = [];
        const callback = async () => {
          timestamps.push(Date.now());
          throw new Error('rejected');
        };
        const locked = new AutomatedCallbackWorkflow(new TokenCache(), callback).callback;

        await locked(params).catch(() => null);
        await locked(params).catch(() => null);

        expect(timestamps).to.have.lengthOf(2);
        expect(timestamps[1] - timestamps[0]).to.be.at.least(90);
      });
    });
  });
});
