import { expect } from 'chai';
import * as sinon from 'sinon';

import type { OIDCResponse } from '../../../../../mongodb';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { WorkflowExecutor } from '../../../../../src/cmap/auth/mongodb_oidc/workflow_executor';
import { MongoCredentials } from '../../../../mongodb';

describe('WorkflowExecutor', function () {
  const credentials = sinon.createStubInstance(MongoCredentials);
  const fn = async (_credentials: MongoCredentials): Promise<OIDCResponse> => {
    return { accessToken: 'test' };
  };
  let clock;

  beforeEach(function () {
    clock = sinon.useFakeTimers(Date.now());
  });

  afterEach(function () {
    clock.restore();
  });

  context('when executing for the first time', function () {
    context('when a response is returned', function () {
      let result;
      const executor = new WorkflowExecutor(100);

      beforeEach(async function () {
        result = await executor.execute(fn, credentials);
      });

      it('returns the response', function () {
        expect(result.accessToken).to.equal('test');
      });

      it('sets the last response on the executor', function () {
        expect(executor.oidcResponse).to.deep.equal({ accessToken: 'test' });
      });

      it('sets the last execution time on the executor', function () {
        expect(executor.lastExecutionTime).to.be.lessThan(Date.now());
      });
    });

    context('when a response is not returned', function () {
      const fnNull = async (_credentials: MongoCredentials): Promise<OIDCResponse> => {
        return null;
      };
      const executor = new WorkflowExecutor(100);

      it('throws an error', async function () {
        const error = await executor.execute(fnNull, credentials).catch(error => error);
        expect(error.message).to.include('No OIDC response');
      });
    });
  });

  context('when not executing for the first time', function () {
    const fnTwo = async (_credentials: MongoCredentials): Promise<OIDCResponse> => {
      return { accessToken: 'test2' };
    };

    context('when the debounce time has not passed', function () {
      let result;
      let lastExecutionTime;
      const executor = new WorkflowExecutor(100);

      beforeEach(async function () {
        await executor.execute(fn, credentials);
        lastExecutionTime = executor.lastExecutionTime;
        clock.tick(50);
        result = await executor.execute(fnTwo, credentials);
      });

      it('returns the last response', function () {
        expect(result.accessToken).to.equal('test');
      });

      it('keeps the last execution time on the executor', function () {
        expect(executor.lastExecutionTime).to.equal(lastExecutionTime);
      });
    });

    context('when the debounce time has passed', function () {
      let result;
      const executor = new WorkflowExecutor(100);

      beforeEach(async function () {
        await executor.execute(fn, credentials);
        clock.tick(150);
        result = await executor.execute(fnTwo, credentials);
      });

      it('returns the next response', function () {
        expect(result.accessToken).to.equal('test2');
      });

      it('sets the last execution time on the executor', function () {
        expect(executor.lastExecutionTime).to.be.lessThan(Date.now());
      });
    });
  });
});
