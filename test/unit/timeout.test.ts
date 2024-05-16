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
    describe('when called with a duration of 0', function () {
      it('does not create a timeout instance (creates infinite timeout)', function () {
        timeout = Timeout.expires(0);
        expect(timeout).to.not.have.property('id');
      });
    });

    describe('when called with a duration greater than 0', function () {
      beforeEach(() => {
        timeout = Timeout.expires(2000);
      });
      it.skip('creates a timeout instance that will not keep the Node.js event loop active', function () {
        expect(timeout).to.have.property('id');
        // @ts-expect-error: accessing private property
        const id = timeout.id;
        expect(id?.hasRef()).to.be.false;
      }).skipReason = 'Skipping until further work during CSOT implementation';

      it('throws a TimeoutError when it expires', async function () {
        try {
          await timeout;
          expect.fail('Expected to throw error');
        } catch (err) {
          expect(err).to.be.instanceof(TimeoutError);
        }
      });
    });

    describe('when called with a duration less than 0', function () {
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

    describe('when called on a non-expired timeout with a non-zero duration', function () {
      it('clears the underlying NodeJS.Timeout instance', function () {
        timeout.clear();
        expect(timeout).to.have.property('id').that.is.undefined;
      });
    });
  });

  describe('is()', function () {
    describe('when called on a Timeout instance', function () {
      it('returns true', function () {
        expect(Timeout.is(Timeout.expires(0))).to.be.true;
      });
    });

    describe('when called on a nullish object ', function () {
      it('returns false', function () {
        expect(Timeout.is(undefined)).to.be.false;
        expect(Timeout.is(null)).to.be.false;
      });
    });

    describe('when called on a primitive type', function () {
      it('returns false', function () {
        expect(Timeout.is(1)).to.be.false;
        expect(Timeout.is('hello')).to.be.false;
        expect(Timeout.is(true)).to.be.false;
        expect(Timeout.is(1n)).to.be.false;
        expect(Timeout.is(Symbol.for('test'))).to.be.false;
      });
    });

    describe('when called on a Promise-like object with a matching toStringTag', function () {
      it('returns true', function () {
        const timeoutLike = {
          [Symbol.toStringTag]: 'MongoDBTimeout',
          then() {
            return 0;
          }
        };
        expect(Timeout.is(timeoutLike)).to.be.true;
      });
    });

    describe('when called on a Promise-like object without a matching toStringTag', function () {
      it('returns false', function () {
        const timeoutLike = {
          [Symbol.toStringTag]: 'lol',
          then() {
            return 0;
          }
        };
        expect(Timeout.is(timeoutLike)).to.be.false;
      });
    });
  });
});
