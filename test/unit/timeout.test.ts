import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';

import { MongoInvalidArgumentError, Timeout, TimeoutError } from '../mongodb';

describe('Timeout', function () {
  let timeout: Timeout;

  beforeEach(() => {
    if (Timeout.is(timeout)) {
      timeout.clear();
    }
  });

  describe('expires()', function () {
    context('when called with a duration of 0', function () {
      it('does not create a timeout instance (creates infinite timeout)', function () {
        timeout = Timeout.expires(0);
        expect(timeout).to.not.have.property('id');
      });
    });

    context('when called with a duration greater than 0', function () {
      beforeEach(() => {
        timeout = Timeout.expires(2000);
      });
      it('creates a timeout instance that will not keep the Node.js event loop active', function () {
        expect(timeout).to.have.property('id');
        const id = timeout['id'];
        // @ts-expect-error: accessing private property
        const id = timeout.id;
      });
      it('throws a TimeoutError when it expires', async function () {
        try {
          await timeout;
          expect.fail('Expected to throw error');
        } catch (err) {
          expect(err).to.be.instanceof(TimeoutError);
        }
      });
    });

    context('when called with a duration less than 0', function () {
      it('throws a MongoInvalidArgumentError', function () {
        try {
          timeout = Timeout.expires(-1);
          expect.fail('Expected to throw error');
        } catch (error) {
          expect(error).to.be.instanceof(MongoInvalidArgumentError);
        }
      });
    });
  });

  describe('clear()', function () {
    beforeEach(() => {
      timeout = Timeout.expires(1000);
      expect(timeout).to.have.property('id').that.is.not.undefined;
    });
    context('when called on a non-expired timeout with a non-zero duration', function () {
      it('clears the underlying NodeJS.Timeout instance', function () {
        timeout.clear();
        expect(timeout).to.have.property('id').that.is.undefined;
      });
    });
  });

  describe('get remainingTime()', function () {
    context('when called on a non-expired timeout with a non-zero duration', function () {
      it('returns the time elapsed from the start of the timeout', async function () {
        timeout = Timeout.expires(1000);
        await setTimeout(500);
        expect(timeout.remainingTime).to.be.lte(500);
      });
    });

    context('when called on an expired timeout with a non-zero duration', function () {
      it('returns 0', async function () {
        timeout = Timeout.expires(10);
        try {
          await timeout;
        } catch (_) {
          // Ignore error
        }
        expect(timeout.remainingTime).to.equal(0);
      });
    });
  });
});
