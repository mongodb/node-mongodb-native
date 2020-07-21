'use strict';
const kDeferred = Symbol('deferred');

(mocha => {
  const Context = mocha.Context;
  function makeExecuteDeferred(test) {
    return () => {
      const deferredActions = test[kDeferred];

      // process actions LIFO
      const promises = Array.from(deferredActions).reverse();
      const result = promises.reduce((p, action) => {
        if (action.length > 0) {
          // assume these are async methods with provided `done`
          const actionPromise = new Promise((resolve, reject) => {
            function done(err) {
              if (err) return reject(err);
              resolve();
            }

            action(done);
          });

          return p.then(actionPromise);
        }

        return p.then(action);
      }, Promise.resolve());

      return result.then(
        () => test[kDeferred].clear(),
        err => {
          test[kDeferred].clear();
          return Promise.reject(err);
        }
      );
    };
  }

  Context.prototype.defer = function (fn) {
    const test = this.test;
    if (test[kDeferred] == null) {
      test[kDeferred] = new Set();

      const parentSuite = test.parent;
      const afterEachHooks = parentSuite._afterEach;
      if (afterEachHooks[0] == null || afterEachHooks[0].title !== kDeferred) {
        const deferredHook = parentSuite._createHook('"deferred" hook', makeExecuteDeferred(test));

        afterEachHooks.unshift(deferredHook);
      }
    }

    test[kDeferred].add(fn);
    return this;
  };
})(require('mocha'));
