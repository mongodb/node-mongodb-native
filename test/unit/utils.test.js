'use strict';
const {
  eachAsync,
  makeInterruptibleAsyncInterval,
  BufferPool,
  shuffle,
  isHello
} = require('../../src/utils');
const { expect } = require('chai');
const sinon = require('sinon');
const { MongoRuntimeError } = require('../../src/error');
const { LEGACY_HELLO_COMMAND } = require('../../src/constants');
const { createTimerSandbox } = require('./timer_sandbox');

describe('driver utils', function () {
  context('eachAsync()', function () {
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
    let timerSandbox, clock, executor, fnSpy;

    beforeEach(function () {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
      fnSpy = sinon.spy(cb => {
        cb();
      });
    });

    afterEach(function () {
      if (executor) {
        executor.stop();
      }
      clock.restore();
      timerSandbox.restore();
    });

    context('when the immediate option is provided', function () {
      it('executes the function immediately and schedules the next execution on the interval', function () {
        executor = makeInterruptibleAsyncInterval(fnSpy, {
          immediate: true,
          minInterval: 10,
          interval: 30
        });
        // expect immediate invocation
        expect(fnSpy.calledOnce).to.be.true;
        // advance clock by less than the scheduled interval to ensure we don't execute early
        clock.tick(29);
        expect(fnSpy.calledOnce).to.be.true;
        // advance clock to the interval
        clock.tick(1);
        expect(fnSpy.calledTwice).to.be.true;
      });
    });

    context('when the immediate option is not provided', function () {
      it('executes the function on the provided interval', function () {
        executor = makeInterruptibleAsyncInterval(fnSpy, { minInterval: 10, interval: 30 });
        // advance clock by less than the scheduled interval to ensure we don't execute early
        clock.tick(29);
        expect(fnSpy.callCount).to.equal(0);
        // advance clock to the interval
        clock.tick(1);
        expect(fnSpy.calledOnce).to.be.true;
        // advance clock by the interval
        clock.tick(30);
        expect(fnSpy.calledTwice).to.be.true;
      });
    });

    describe('#wake', function () {
      context('when the time until next call is negative', () => {
        // somehow we missed the execution, due to an unreliable clock

        it('should execute immediately and schedule the next execution on the interval if this is the first wake', () => {
          let fakeClockHasTicked = false;
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30,
            clock: () => {
              if (fakeClockHasTicked) {
                return 81;
              }
              fakeClockHasTicked = true;
              return 50;
            }
          });

          // tick the environment clock by a smaller amount than the interval
          clock.tick(2);
          // sanity check to make sure we haven't called execute yet
          expect(fnSpy.callCount).to.equal(0);
          executor.wake();
          // expect immediate execution since expected next call time was 50 + 30 = 80, but the clock shows 81
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute immediately and schedule the next execution on the interval if this is a repeated wake and the current execution is not rescheduled', () => {
          let fakeClockTickCount = 0;
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30,
            clock: () => {
              if (fakeClockTickCount === 0) {
                // on init, return arbitrary starting time
                fakeClockTickCount++;
                return 50;
              }
              if (fakeClockTickCount === 1) {
                // expected execution time is 80
                // on first wake return a time so less than minInterval is left and no need to reschedule
                fakeClockTickCount++;
                return 71;
              }
              return 81;
            }
          });

          // tick the clock by a small amount before and after the wake to make sure no unexpected async things are happening
          clock.tick(11);
          executor.wake();
          clock.tick(5);
          expect(fnSpy.callCount).to.equal(0);
          // call our second wake that gets the overdue timer, so expect immediate execution
          executor.wake();
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute immediately and schedule the next execution on the interval if this is a repeated wake even if the current execution is rescheduled', () => {
          let fakeClockTickCount = 0;
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30,
            clock: () => {
              if (fakeClockTickCount === 0) {
                // on init, return arbitrary starting time
                fakeClockTickCount++;
                return 50;
              }
              if (fakeClockTickCount === 1) {
                // expected execution time is 80
                // on first wake return a time so that more than minInterval is left
                fakeClockTickCount++;
                return 61;
              }
              return 81;
            }
          });

          // tick the clock by a small amount before and after the wake to make sure no unexpected async things are happening
          clock.tick(2);
          executor.wake();
          clock.tick(9);
          expect(fnSpy.callCount).to.equal(0);
          // call our second wake that gets the overdue timer, so expect immediate execution
          executor.wake();
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when the time until next call is less than the minInterval', () => {
        // we can't make it go any faster, so we should let the scheduled execution run

        it('should execute on the interval if this is the first wake', () => {
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30
          });
          // tick the environment clock so that less than minInterval is left
          clock.tick(21);
          executor.wake();
          // move forward to just before exepected execution time
          clock.tick(8);
          expect(fnSpy.callCount).to.equal(0);
          // move forward to the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the original interval if this is a repeated wake and the current execution is not rescheduled', () => {
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30
          });
          // tick the environment clock so that less than minInterval is left
          clock.tick(21);
          executor.wake();
          // tick the environment clock some more so that the next wake is called at a different time
          clock.tick(2);
          executor.wake();
          // tick to just before the expected execution time
          clock.tick(6);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 20 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the minInterval from the first wake if this is a repeated wake and the current execution is rescheduled', () => {
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(13);
          executor.wake();
          // the first wake should move up the execution to occur at 23 ticks from the start
          // we tick 8 to get to 21, so that less than minInterval is left on the original interval expected execution
          clock.tick(8);
          executor.wake();
          // now we tick to just before the rescheduled execution time
          clock.tick(1);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 23 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when the time until next call is more than the minInterval', () => {
        // expedite the execution to minInterval

        it('should execute on the minInterval if this is the first wake', () => {
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(3);
          executor.wake();
          // the first wake should move up the execution to occur at 13 ticks from the start
          // we tick to just before the rescheduled execution time
          clock.tick(9);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 13 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the minInterval from the first wake if this is a repeated wake', () => {
          // NOTE: under regular circumstances, if the second wake is early enough to warrant a reschedule
          // then the first wake must have already warranted a reschedule
          executor = makeInterruptibleAsyncInterval(fnSpy, {
            minInterval: 10,
            interval: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(3);
          executor.wake();
          // the first wake should move up the execution to occur at 13 ticks from the start
          // we tick a bit more so that more than minInterval is still left and call our repeated wake
          clock.tick(2);
          executor.wake();
          // tick up to just before the expected execution
          clock.tick(7);
          expect(fnSpy.callCount).to.equal(0);
          // now go up to 13
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });
    });
  });

  context('new BufferPool()', function () {
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

  describe('shuffle()', () => {
    it('should support iterables', function () {
      // Kind of an implicit test, we should not throw/crash here.
      const input = new Set(['a', 'b', 'c']);
      const output = shuffle(input);
      expect(Array.isArray(output)).to.be.true;
    });

    it('should not mutate the original input', function () {
      const input = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
      const output = shuffle(input); // This will throw if shuffle tries to edit the input
      expect(output === input).to.be.false;
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it(`should give a random subset of length equal to limit when limit is less than the input length`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, input.length - 1);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length - 1);
    });

    it(`should give a random shuffling of the entire input when limit is equal to input length`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, input.length);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it(`should always return the same element when input is one item`, function () {
      const input = ['a'];
      for (let i = 0; i < 10; i++) {
        const output = shuffle(input);
        expect(output).to.deep.equal(input);
      }
      for (let i = 0; i < 10; i++) {
        const output = shuffle(input, 1); // and with limit
        expect(output).to.deep.equal(input);
      }
    });

    it(`should return a random item on every call of limit 1`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const outputs = new Set();
      for (let i = 0; i < 5; i++) {
        const output = shuffle(input, 1);
        expect(output).to.have.lengthOf(1);
        outputs.add(output[0]);
      }
      // Of the 5 shuffles we got at least 2 unique random items, this is to avoid flakiness
      expect(outputs.size).is.greaterThanOrEqual(2);
    });

    it('should give a random shuffling of the entire input when no limit provided', () => {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input);
      // Of course it is possible a shuffle returns exactly the same as the input
      // but it is so improbable it is worth the flakiness in my opinion
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });
    it('should give a random shuffling of the entire input when limit is explicitly set to 0', () => {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, 0);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it('should handle empty array if limit is unspecified or 0', function () {
      expect(shuffle([])).to.deep.equal([]);
      expect(shuffle([], 0)).to.deep.equal([]);
    });

    it('should throw if limit is greater than zero and empty array', function () {
      expect(() => shuffle([], 2)).to.throw(MongoRuntimeError);
      expect(() => shuffle([], 1)).to.throw(MongoRuntimeError);
    });

    it('should throw if limit is larger than input size', () => {
      expect(() => shuffle(['a', 'b'], 3)).to.throw(MongoRuntimeError);
    });
  });

  context('isHello()', function () {
    it('should return true if document has legacy hello property set to true', function () {
      const doc = { [LEGACY_HELLO_COMMAND]: true };
      expect(isHello(doc)).to.be.true;
    });

    it('should return true if document has hello property set to true', function () {
      const doc = { hello: true };
      expect(isHello(doc)).to.be.true;
    });

    it('should return false if document does not have legacy hello property or hello property', function () {
      const doc = { a: 'b' };
      expect(isHello(doc)).to.be.false;
    });

    it('should return false if the legacy hello property and hello property are set to false', function () {
      const doc = { [LEGACY_HELLO_COMMAND]: false, hello: false };
      expect(isHello(doc)).to.be.false;
    });
  });
});
