import { expect } from 'chai';

import {
  CSOTTimeoutContext,
  LegacyTimeoutContext,
  MongoInvalidArgumentError,
  MongoRuntimeError,
  Timeout,
  TimeoutContext,
  TimeoutError
} from '../mongodb';

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

  describe('is()', function () {
    context('when called on a Timeout instance', function () {
      it('returns true', function () {
        expect(Timeout.is(Timeout.expires(0))).to.be.true;
      });
    });

    context('when called on a nullish object ', function () {
      it('returns false', function () {
        expect(Timeout.is(undefined)).to.be.false;
        expect(Timeout.is(null)).to.be.false;
      });
    });

    context('when called on a primitive type', function () {
      it('returns false', function () {
        expect(Timeout.is(1)).to.be.false;
        expect(Timeout.is('hello')).to.be.false;
        expect(Timeout.is(true)).to.be.false;
        expect(Timeout.is(1n)).to.be.false;
        expect(Timeout.is(Symbol.for('test'))).to.be.false;
      });
    });

    context('when called on a Promise-like object with a matching toStringTag', function () {
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

    context('when called on a Promise-like object without a matching toStringTag', function () {
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

describe('TimeoutContext', function () {
  describe('TimeoutContext.create', function () {
    describe('when timeoutMS is a number', function () {
      it('returns a CSOTTimeoutContext instance', function () {
        const ctx = TimeoutContext.create({
          timeoutMS: 0,
          serverSelectionTimeoutMS: 0,
          waitQueueTimeoutMS: 0
        });

        expect(ctx).to.be.instanceOf(CSOTTimeoutContext);
      });
    });

    describe('when timeoutMS is undefined', function () {
      it('returns a LegacyTimeoutContext instance', function () {
        const ctx = TimeoutContext.create({
          serverSelectionTimeoutMS: 0,
          waitQueueTimeoutMS: 0
        });

        expect(ctx).to.be.instanceOf(LegacyTimeoutContext);
      });
    });
  });

  describe('CSOTTimeoutContext', function () {
    let ctx: CSOTTimeoutContext;

    describe('get serverSelectionTimeout()', function () {
      let timeout: Timeout | null;

      afterEach(() => {
        timeout?.clear();
      });

      describe('when timeoutMS is 0 and serverSelectionTimeoutMS is 0', function () {
        it('returns null', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 0,
            serverSelectionTimeoutMS: 0,
            waitQueueTimeoutMS: 0
          });

          expect(ctx.serverSelectionTimeout).to.be.null;
        });
      });

      describe('when timeoutMS is 0 and serverSelectionTimeoutMS is >0', function () {
        it('returns a Timeout instance with duration set to serverSelectionTimeoutMS', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 0,
            serverSelectionTimeoutMS: 10,
            waitQueueTimeoutMS: 0
          });

          timeout = ctx.serverSelectionTimeout;
          expect(timeout).to.be.instanceOf(Timeout);

          expect(timeout.duration).to.equal(ctx.serverSelectionTimeoutMS);
        });
      });

      describe('when timeoutMS is >0 serverSelectionTimeoutMS is >0 and timeoutMS > serverSelectionTimeoutMS', function () {
        it('returns a Timeout instance with duration set to serverSelectionTimeoutMS', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 15,
            serverSelectionTimeoutMS: 10,
            waitQueueTimeoutMS: 0
          });

          timeout = ctx.serverSelectionTimeout;
          expect(timeout).to.exist;
          expect(timeout).to.be.instanceOf(Timeout);
          expect(timeout.duration).to.equal(ctx.serverSelectionTimeoutMS);
        });
      });

      describe('when timeoutMS is >0, serverSelectionTimeoutMS is >0 and timeoutMS < serverSelectionTimeoutMS', function () {
        it('returns a Timeout instance with duration set to timeoutMS', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 10,
            serverSelectionTimeoutMS: 15,
            waitQueueTimeoutMS: 0
          });

          timeout = ctx.serverSelectionTimeout;
          expect(timeout).to.exist;
          expect(timeout).to.be.instanceOf(Timeout);
          expect(timeout.duration).to.equal(ctx.timeoutMS);
        });
      });
    });

    describe('get connectionCheckoutTimeout()', function () {
      describe('when called before get serverSelectionTimeout()', function () {
        it('throws a MongoRuntimeError', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 100,
            serverSelectionTimeoutMS: 15,
            waitQueueTimeoutMS: 10
          });

          expect(() => ctx.connectionCheckoutTimeout).to.throw(MongoRuntimeError);
        });
      });

      describe('when called after get serverSelectionTimeout()', function () {
        let serverSelectionTimeout: Timeout;
        let connectionCheckoutTimeout: Timeout;

        afterEach(() => {
          serverSelectionTimeout.clear();
          connectionCheckoutTimeout.clear();
        });

        it('returns same timeout as serverSelectionTimeout', function () {
          ctx = new CSOTTimeoutContext({
            timeoutMS: 100,
            serverSelectionTimeoutMS: 86,
            waitQueueTimeoutMS: 0
          });
          serverSelectionTimeout = ctx.serverSelectionTimeout;
          connectionCheckoutTimeout = ctx.connectionCheckoutTimeout;

          expect(connectionCheckoutTimeout).to.exist;
          expect(connectionCheckoutTimeout).to.equal(serverSelectionTimeout);
        });
      });
    });
  });

  describe('LegacyTimeoutContext', function () {
    let timeout: Timeout | null;

    afterEach(() => {
      timeout?.clear();
    });

    describe('get serverSelectionTimeout()', function () {
      describe('when serverSelectionTimeoutMS > 0', function () {
        it('returns a Timeout instance with duration set to serverSelectionTimeoutMS', function () {
          const ctx = new LegacyTimeoutContext({
            serverSelectionTimeoutMS: 100,
            waitQueueTimeoutMS: 10
          });

          timeout = ctx.serverSelectionTimeout;
          expect(timeout).to.be.instanceOf(Timeout);
          expect(timeout.duration).to.equal(ctx.options.serverSelectionTimeoutMS);
        });
      });

      describe('when serverSelectionTimeoutMS = 0', function () {
        it('returns null', function () {
          const ctx = new LegacyTimeoutContext({
            serverSelectionTimeoutMS: 0,
            waitQueueTimeoutMS: 10
          });

          timeout = ctx.serverSelectionTimeout;
          expect(timeout).to.be.null;
        });
      });
    });

    describe('get connectionCheckoutTimeout()', function () {
      describe('when waitQueueTimeoutMS > 0', function () {
        it('returns a Timeout instance with duration set to waitQueueTimeoutMS', function () {
          const ctx = new LegacyTimeoutContext({
            serverSelectionTimeoutMS: 10,
            waitQueueTimeoutMS: 20
          });
          timeout = ctx.connectionCheckoutTimeout;

          expect(timeout).to.be.instanceOf(Timeout);
          expect(timeout.duration).to.equal(ctx.options.waitQueueTimeoutMS);
        });
      });

      describe('when waitQueueTimeoutMS = 0', function () {
        it('returns null', function () {
          const ctx = new LegacyTimeoutContext({
            serverSelectionTimeoutMS: 10,
            waitQueueTimeoutMS: 0
          });

          expect(ctx.connectionCheckoutTimeout).to.be.null;
        });
      });
    });
  });
});
