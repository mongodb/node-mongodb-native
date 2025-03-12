'use strict';

const kDeferred = Symbol('deferred');
const mocha = require('mocha');

const { Context } = mocha;

function makeExecuteDeferred(test) {
  return async function () {
    /** @type {Array<() => Promise<void>>} */
    const deferredActions = test[kDeferred];

    // process actions LIFO
    const actions = Array.from(deferredActions).reverse();

    try {
      for (const fn of actions) {
        await fn();
      }
    } finally {
      test[kDeferred].length = 0;
    }
  };
}

Context.prototype.defer = function defer(fn) {
  const test = this.test;

  if (typeof fn !== 'function') {
    throw new Error('defer is meant to take a function that returns a promise');
  }

  if (test[kDeferred] == null) {
    test[kDeferred] = [];

    const parentSuite = test.parent;
    const afterEachHooks = parentSuite._afterEach;
    if (afterEachHooks[0] == null || afterEachHooks[0].title !== kDeferred) {
      const deferredHook = parentSuite._createHook('"deferred" hook', makeExecuteDeferred(test));

      // defer runs after test but before afterEach(s)
      afterEachHooks.unshift(deferredHook);
    }
  }

  if (test[kDeferred].includes(fn)) {
    throw new Error('registered the same deferred action more than once');
  }

  test[kDeferred].push(fn);
  return this;
};
