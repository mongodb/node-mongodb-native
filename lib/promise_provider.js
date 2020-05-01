'use strict';

const assert = require('assert');

/**
 * Helper for multiplexing promise implementations
 *
 * @api private
 */

const store = {
  _promise: null
};

/**
 * Get the current promise constructor
 *
 * @api private
 */

store.get = function() {
  const values = Object.keys(arguments).map(k => arguments[k]);
  const result = values.reduce((acq, parent) => {
    if (acq) return acq;
    if (parent && parent.promiseLibrary) {
      return parent.promiseLibrary;
    }
    if (parent && parent.options && parent.options.promiseLibrary) {
      return parent.options.promiseLibrary;
    }
    if (parent && parent.s && parent.s.promiseLibrary) {
      return parent.s.promiseLibrary;
    }
    if (parent && parent.clientOptions && parent.clientOptions.promiseLibrary) {
      return parent.clientOptions.promiseLibrary;
    }
    return null;
  }, null);
  return result || store._promise;
};

/**
 * Set the current promise constructor
 *
 * @api private
 */

store.set = function(lib) {
  assert.ok(typeof lib === 'function', `Promise must be a function, got ${lib}`);
  store._promise = lib;
};

/*!
 * Use native promises by default
 */

store.set(global.Promise);

module.exports = store;
