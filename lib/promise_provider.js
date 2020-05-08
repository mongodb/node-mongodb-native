'use strict';

const kPromise = Symbol('promise');

const store = {
  [kPromise]: undefined
};

/** global promise store allowing user-provided promises */
class PromiseProvider {
  /**
   * validates the passed in promise library
   *
   * @param {Function} lib promise implementation
   */
  static validate(lib) {
    if (typeof lib !== 'function') throw new Error(`Promise must be a function, got ${lib}`);
    return lib;
  }

  /**
   * sets the promise library
   *
   * @param {Function} lib promise implementation
   */
  static set(lib) {
    store[kPromise] = PromiseProvider.validate(lib);
  }

  /**
   * get the stored promise library, or resolves passed in
   */
  static get() {
    return store[kPromise];
  }
}

PromiseProvider.set(global.Promise);

module.exports = PromiseProvider;
