'use strict';
const { eachAsync, now, makeInterruptableAsyncInterval } = require('../../lib/utils');
const { expect } = require('chai');

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
    const roundToNearestMultipleOfTen = x => Math.floor(x / 10) * 10;

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
        const roundedMarks = marks.map(roundToNearestMultipleOfTen);
        expect(roundedMarks.every(mark => roundedMarks[0] === mark)).to.be.true;
        executor.stop();
        done();
      }, 50);
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
        const roundedMarks = marks.map(roundToNearestMultipleOfTen);
        expect(roundedMarks[0]).to.equal(10);
        executor.stop();
        done();
      }, 50);
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
        const roundedMarks = marks.map(roundToNearestMultipleOfTen);
        expect(roundedMarks[0]).to.equal(10);
        expect(roundedMarks.slice(1).every(mark => mark === 50)).to.be.true;
        executor.stop();
        done();
      }, 250);
    });
  });
});
