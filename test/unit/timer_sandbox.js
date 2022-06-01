'use strict';
const sinon = require('sinon');

/**
 * sinon.useFakeTimers() only affects global methods, this function
 * creates a sinon sandbox that ensures that require('timers')
 * also uses the mocked variants.
 *
 * @returns {sinon.SinonSandbox}
 */
exports.createTimerSandbox = () => {
  const timerSandbox = sinon.createSandbox();
  const timers = require('timers');
  for (const method in timers) {
    if (method in global) {
      timerSandbox.replace(timers, method, (...args) => {
        return global[method](...args);
      });
    }
  }
  return timerSandbox;
};
