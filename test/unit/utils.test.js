'use strict';
const { eachAsync, now, makeInterruptableAsyncInterval } = require('../../src/utils');
const { expect } = require('chai');
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
  });
});
