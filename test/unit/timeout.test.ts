import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';

import { CSOTError, Timeout } from '../mongodb';

describe('Timeout', function () {
  let timeout: Timeout;

  beforeEach(() => {
    if (Timeout.is(timeout)) {
      timeout.clear();
    }
  });

  describe('constructor()', function () {
    context('when called with a timeout of 0', function () {
      it('does not create a timeout instance', function () {
        timeout = Timeout.expires(0);
        expect(timeout).to.not.have.property('id');
      });
    });

    context('when called with a timeout greater than 0', function () {
      beforeEach(() => {
        timeout = Timeout.expires(2000);
      });
      it('creates a timeout instance that will not keep the Node.js event loop active', function () {
        expect(timeout).to.have.property('id');
        const id = timeout['id'];
        expect(id?.hasRef()).to.be.false;
      });
      it('throws a CSOTError when it expires', async function () {
        try {
          await timeout;
          expect.fail('Expected to throw error');
        } catch (err) {
          expect(err).to.be.instanceof(CSOTError);
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
