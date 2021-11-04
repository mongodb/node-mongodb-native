'use strict';
const {
  eachAsync,
  executeLegacyOperation,
  makeInterruptibleAsyncInterval,
  BufferPool
} = require('../../src/utils');
const { expect } = require('chai');
const sinon = require('sinon');

describe('utils', function () {
  context('eachAsync', function () {
    it('should callback with an error', function (done) {
      eachAsync(
        [{ error: false }, { error: true }],
        (item, cb) => {
          cb(item.error ? new Error('error requested') : null);
        },
        err => {
          expect(err).to.exist;
          done();
        }
      );
    });

    it('should propagate a synchronously thrown error', function (done) {
      expect(() =>
        eachAsync(
          [{}],
          () => {
            throw new Error('something wicked');
          },
          err => {
            expect(err).to.not.exist;
            done(err);
          }
        )
      ).to.throw(/something wicked/);
      done();
    });
  });

  describe('#makeInterruptibleAsyncInterval', function () {
    let clock;

    beforeEach(function () {
      clock = sinon.useFakeTimers();
    });

    afterEach(function () {
      clock.restore();
    });

    context('when the immediate option is provided', function () {
      const fn = callback => {
        callback();
      };
      const fnSpy = sinon.spy(fn);

      it('executes the function immediately', function (done) {
        const executor = makeInterruptibleAsyncInterval(fnSpy, { immediate: true, interval: 20 });
        setTimeout(() => {
          // The provided function should be called exactly once, since we wait 10ms
          // to perform the assertion and the interval is 20ms, so the executor is
          // stopped before the scheduled next call.
          expect(fnSpy.calledOnce).to.be.true;
          executor.stop();
          done();
        }, 10);
        clock.tick(10);
      });
    });

    context('when the immediate option is not provided', function () {
      const fn = callback => {
        callback();
      };
      const fnSpy = sinon.spy(fn);

      it('executes the function on the provided interval', function (done) {
        const executor = makeInterruptibleAsyncInterval(fnSpy, { interval: 10 });
        setTimeout(() => {
          // The provided function should be called exactly twice, since we wait 21ms
          // to perform the assertion and the interval is 10ms, so the executor is
          // stopped before the third call.
          expect(fnSpy.calledTwice).to.be.true;
          executor.stop();
          done();
        }, 21);
        clock.tick(21);
      });
    });

    describe('#wake', function () {
      context('when the time until next call is negative', function () {
        const fn = callback => {
          callback();
        };
        const fnSpy = sinon.spy(fn);

        it('calls the function immediately', function (done) {
          const executor = makeInterruptibleAsyncInterval(fnSpy, {
            interval: 10,
            clock: () => {
              // We have our fake clock return a value that will force
              // the time until the next call to be a negative value,
              // which will in turn force an immediate execution upon
              // wake.
              return 11;
            }
          });

          // This will reset the last call time to 0 and ensure the function has
          // not been called yet.
          executor.stop();
          // Now we call our method under test with the expectation it will force
          // an immediate execution.
          executor.wake();

          setTimeout(() => {
            // The provided function should be called exactly once in this section.
            // This is because we immediately stopped the executor, then force woke
            // it to get an immediate call with time until the next call being a
            // negative value.
            expect(fnSpy.calledOnce).to.be.true;
            executor.stop();
            done();
          }, 10);
          clock.tick(11);
        });
      });

      context('when time since last wake is less than the minimum interval', function () {
        const fn = callback => {
          callback();
        };
        const fnSpy = sinon.spy(fn);

        it('does not call the function', function (done) {
          const executor = makeInterruptibleAsyncInterval(fnSpy, { interval: 10 });

          // This will reset the last wake time to 0 and ensure the function has
          // not been called yet.
          executor.stop();
          // Now we call our method under test with the expectation it will not be
          // called immediately since our current time is still under the interval
          // time.
          executor.wake();

          setTimeout(() => {
            // The provided function should never be called in this case.
            // This is because we immediately stopped the executor, then force woke
            // it but the current time is still under the interval time.
            expect(fnSpy.callCount).to.equal(0);
            executor.stop();
            done();
          }, 9);
          clock.tick(9);
        });
      });

      context('when time since last call is greater than the minimum interval', function () {
        const fn = callback => {
          callback();
        };
        const fnSpy = sinon.spy(fn);

        it('reschedules the function call for the minimum interval', function (done) {
          const executor = makeInterruptibleAsyncInterval(fnSpy, {
            interval: 50,
            minInterval: 10
          });

          // Calling wake here will force the reschedule to happen at the minimum interval
          // provided, which is 10ms.
          executor.wake();

          setTimeout(() => {
            // We expect function calls to happen after 10ms, which is the minimum interval,
            // and then in 50ms intervals after that. The second call would happen at 60ms
            // time from the original call so we've stopped the executor before a third.
            expect(fnSpy.calledTwice).to.be.true;
            executor.stop();
            done();
          }, 61);
          clock.tick(61);
        });
      });
    });
  });

  context('BufferPool', function () {
    it('should report the correct length', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      buffer.append(Buffer.from([2, 3]));
      buffer.append(Buffer.from([2, 3]));
      expect(buffer).property('length').to.equal(6);
    });

    it('return an empty buffer if too many bytes requested', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1, 2, 3]));
      const data = buffer.read(6);
      expect(data).to.have.length(0);
      expect(buffer).property('length').to.equal(4);
    });

    context('peek', function () {
      it('exact size', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1]));
        const data = buffer.peek(2);
        expect(data).to.eql(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(2);
      });

      it('within first buffer', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1, 2, 3]));
        const data = buffer.peek(2);
        expect(data).to.eql(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(4);
      });

      it('across multiple buffers', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1]));
        buffer.append(Buffer.from([2, 3]));
        buffer.append(Buffer.from([4, 5]));
        expect(buffer).property('length').to.equal(6);
        const data = buffer.peek(5);
        expect(data).to.eql(Buffer.from([0, 1, 2, 3, 4]));
        expect(buffer).property('length').to.equal(6);
      });
    });

    context('read', function () {
      it('should throw an error if a negative size is requested', function () {
        const buffer = new BufferPool();
        expect(() => buffer.read(-1)).to.throw(/Argument "size" must be a non-negative number/);
      });

      it('should throw an error if a non-number size is requested', function () {
        const buffer = new BufferPool();
        expect(() => buffer.read('256')).to.throw(/Argument "size" must be a non-negative number/);
      });

      it('exact size', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1]));
        const data = buffer.read(2);
        expect(data).to.eql(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(0);
      });

      it('within first buffer', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1, 2, 3]));
        const data = buffer.read(2);
        expect(data).to.eql(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(2);
      });

      it('across multiple buffers', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1]));
        buffer.append(Buffer.from([2, 3]));
        buffer.append(Buffer.from([4, 5]));
        expect(buffer).property('length').to.equal(6);
        const data = buffer.read(5);
        expect(data).to.eql(Buffer.from([0, 1, 2, 3, 4]));
        expect(buffer).property('length').to.equal(1);
        expect(buffer.read(1)).to.eql(Buffer.from([5]));
      });
    });
  });

  context('executeLegacyOperation', function () {
    it('should call callback with errors on throw errors, and rethrow error', function () {
      const expectedError = new Error('THIS IS AN ERROR');
      let callbackError, caughtError;

      const topology = {
        logicalSessionTimeoutMinutes: null
      };
      const operation = () => {
        throw expectedError;
      };

      const callback = err => (callbackError = err);
      const options = { skipSessions: true };

      try {
        executeLegacyOperation(topology, operation, [{}, callback], options);
      } catch (e) {
        caughtError = e;
      }

      expect(callbackError).to.equal(expectedError);
      expect(caughtError).to.equal(expectedError);
    });

    it('should reject promise with errors on throw errors, and rethrow error', function () {
      const expectedError = new Error('THIS IS AN ERROR');

      const topology = {
        logicalSessionTimeoutMinutes: null
      };
      const operation = () => {
        throw expectedError;
      };

      const options = { skipSessions: true };

      return executeLegacyOperation(topology, operation, [{}, null], options).then(null, err => {
        expect(err).to.equal(expectedError);
      });
    });
  });
});
