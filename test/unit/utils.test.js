'use strict';
const eachAsync = require('../../lib/core/utils').eachAsync;
const makeInterruptableAsyncInterval = require('../../lib/utils').makeInterruptableAsyncInterval;
const now = require('../../lib/utils').now;
const hasAtomicOperators = require('../../lib/utils').hasAtomicOperators;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('utils', function() {
  context('eachAsync', function() {
    it('should callback with an error', function(done) {
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

    it('should propagate a synchronously thrown error', function(done) {
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

  context('makeInterruptableAsyncInterval', function() {
    before(function() {
      this.clock = sinon.useFakeTimers();
    });

    after(function() {
      this.clock.restore();
    });

    it('should execute a method in an repeating interval', function(done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptableAsyncInterval(
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

    it('should schedule execution sooner if requested within min interval threshold', function(done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptableAsyncInterval(
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

    it('should debounce multiple requests to wake the interval sooner', function(done) {
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptableAsyncInterval(
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

    it('should immediately schedule if the clock is unreliable', function(done) {
      let clockCalled = 0;
      let lastTime = now();
      const marks = [];
      const executor = makeInterruptableAsyncInterval(
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
            if (clockCalled === 3) {
              return now() - 100000;
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

  it('should assert hasAtomicOperators and respect toBSON conversion', function() {
    expect(hasAtomicOperators({ $key: 2.3 })).to.be.true;
    expect(hasAtomicOperators({ nonAtomic: 1, $key: 2.3 })).to.be.true;
    expect(
      hasAtomicOperators({
        $key: 2.3,
        toBSON() {
          return { key: this.$key };
        }
      })
    ).to.be.false;
  });
});
