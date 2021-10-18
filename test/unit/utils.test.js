'use strict';
const {
  eachAsync,
  executeLegacyOperation,
  now,
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

  context('makeInterruptibleAsyncInterval', function () {
    before(function () {
      this.clock = sinon.useFakeTimers();
    });

    after(function () {
      this.clock.restore();
    });

    it('should execute a method in an repeating interval', function (done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptibleAsyncInterval(
        callback => {
          marks.push(now() - lastTime);
          lastTime = now();
          callback();
        },
        { interval: 10 }
      );

      setTimeout(() => {
        expect(marks).to.eql([10, 10, 10, 10, 10]);
        expect(marks.every(mark => marks[0] === mark)).to.be.true;
        executor.stop();
        done();
      }, 51);

      this.clock.tick(51);
    });

    it('should schedule execution sooner if requested within min interval threshold', function (done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptibleAsyncInterval(
        callback => {
          marks.push(now() - lastTime);
          lastTime = now();
          callback();
        },
        { interval: 50, minInterval: 10 }
      );

      // immediately schedule execution
      executor.wake();

      setTimeout(() => {
        expect(marks).to.eql([10, 50]);
        executor.stop();
        done();
      }, 100);

      this.clock.tick(100);
    });

    it('should debounce multiple requests to wake the interval sooner', function (done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptibleAsyncInterval(
        callback => {
          marks.push(now() - lastTime);
          lastTime = now();
          callback();
        },
        { interval: 50, minInterval: 10 }
      );

      for (let i = 0; i < 100; ++i) {
        executor.wake();
      }

      setTimeout(() => {
        expect(marks).to.eql([10, 50, 50, 50, 50]);
        executor.stop();
        done();
      }, 250);

      this.clock.tick(250);
    });

    it('should immediately schedule if the clock is unreliable', function (done) {
      let clockCalled = 0;
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptibleAsyncInterval(
        callback => {
          marks.push(now() - lastTime);
          lastTime = now();
          callback();
        },
        {
          interval: 50,
          minInterval: 10,
          immediate: true,
          clock() {
            clockCalled += 1;

            // needs to happen on the third call because `wake` checks
            // the `currentTime` at the beginning of the function
            // The value of now() is not actually negative in the case of
            // the unreliable check so we force to a negative value now
            // for this test.
            if (clockCalled === 3) {
              return -1;
            }

            return now();
          }
        }
      );

      // force mark at 20ms, and then the unreliable system clock
      // will report a very stale `lastCallTime` on this mark.
      setTimeout(() => executor.wake(), 10);

      // try to wake again in another `minInterval + immediate`, now
      // using a very old `lastCallTime`. This should result in an
      // immediate scheduling: 0ms (immediate), 20ms (wake with minIterval)
      // and then 10ms for another immediate.
      setTimeout(() => executor.wake(), 30);

      setTimeout(() => {
        executor.stop();
        expect(marks).to.eql([0, 20, 10, 50, 50, 50, 50]);
        done();
      }, 250);
      this.clock.tick(250);
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
