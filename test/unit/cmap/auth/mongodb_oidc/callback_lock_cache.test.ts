import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  CallbackLockCache,
  Connection,
  MongoCredentials,
  MongoInvalidArgumentError
} from '../../../../mongodb';
import { sleep } from '../../../../tools/utils';

describe('CallbackLockCache', function () {
  describe('#getCallbacks', function () {
    const connection = sinon.createStubInstance(Connection);
    connection.address = 'localhost:27017';

    describe('when a request callback does not exist', function () {
      const credentials = new MongoCredentials({
        username: 'test_user',
        password: 'pwd',
        source: '$external',
        mechanismProperties: {}
      });
      const cache = new CallbackLockCache();

      it('raises an error', function () {
        try {
          cache.getEntry(connection, credentials);
          expect.fail('Must raise error when no request callback exists.');
        } catch (error) {
          expect(error).to.be.instanceOf(MongoInvalidArgumentError);
          expect(error.message).to.include(
            'Auth mechanism property REQUEST_TOKEN_CALLBACK is required'
          );
        }
      });
    });

    describe('when no entry exists in the cache', function () {
      describe('when a refresh callback exists', function () {
        let requestCount = 0;
        let refreshCount = 0;
        const request = async () => {
          requestCount++;
          if (requestCount > 1) {
            throw new Error('Cannot execute request simultaneously.');
          }
          await sleep(1000);
          requestCount--;
          return { accessToken: '' };
        };
        const refresh = async () => {
          refreshCount++;
          if (refreshCount > 1) {
            throw new Error('Cannot execute refresh simultaneously.');
          }
          await sleep(1000);
          refreshCount--;
          return Promise.resolve({ accessToken: '' });
        };
        const requestSpy = sinon.spy(request);
        const refreshSpy = sinon.spy(refresh);
        const credentials = new MongoCredentials({
          username: 'test_user',
          password: 'pwd',
          source: '$external',
          mechanismProperties: {
            REQUEST_TOKEN_CALLBACK: requestSpy,
            REFRESH_TOKEN_CALLBACK: refreshSpy
          }
        });
        const cache = new CallbackLockCache();
        const { requestCallback, refreshCallback, callbackHash } = cache.getEntry(
          connection,
          credentials
        );

        it('puts a new entry in the cache', function () {
          expect(cache.entries).to.have.lengthOf(1);
        });

        it('returns the new entry', function () {
          expect(requestCallback).to.exist;
          expect(refreshCallback).to.exist;
          expect(callbackHash).to.exist;
        });

        it('locks the callbacks', async function () {
          await Promise.allSettled([
            requestCallback(),
            requestCallback(),
            refreshCallback(),
            refreshCallback()
          ]);
          expect(requestSpy).to.have.been.calledTwice;
          expect(refreshSpy).to.have.been.calledTwice;
        });
      });

      describe('when a refresh function does not exist', function () {
        let requestCount = 0;
        const request = async () => {
          requestCount++;
          if (requestCount > 1) {
            throw new Error('Cannot execute request simultaneously.');
          }
          await sleep(1000);
          requestCount--;
          return Promise.resolve({ accessToken: '' });
        };
        const requestSpy = sinon.spy(request);
        const credentials = new MongoCredentials({
          username: 'test_user',
          password: 'pwd',
          source: '$external',
          mechanismProperties: {
            REQUEST_TOKEN_CALLBACK: requestSpy
          }
        });
        const cache = new CallbackLockCache();
        const { requestCallback, refreshCallback, callbackHash } = cache.getEntry(
          connection,
          credentials
        );

        it('puts a new entry in the cache', function () {
          expect(cache.entries).to.have.lengthOf(1);
        });

        it('returns the new entry', function () {
          expect(requestCallback).to.exist;
          expect(refreshCallback).to.not.exist;
          expect(callbackHash).to.exist;
        });

        it('locks the callbacks', async function () {
          await Promise.allSettled([requestCallback(), requestCallback()]);
          expect(requestSpy).to.have.been.calledTwice;
        });
      });
    });
  });
});
