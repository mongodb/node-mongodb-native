'use strict';

const kPromise = Symbol('promise');

const store = {
  [kPromise]: global.Promise
};

/** global promise store allowing user-provided promises */
class PromiseProvider {
  /** validates the passed in promise library */
  static validate(lib) {
    if (typeof lib !== 'function') throw new Error(`Promise must be a function, got ${lib}`);
    return lib;
  }

  /** sets the promise library */
  static set(lib) {
    store[kPromise] = PromiseProvider.validate(lib);
  }

  /** get the stored promise library, or resolves passed in */
  static get() {
    const result = Object.keys(arguments).reduce((acq, k) => {
      const parent = arguments[k];
      if (acq) return acq;
      if (parent && parent.promiseLibrary) {
        return PromiseProvider.validate(parent.promiseLibrary);
      }
      if (parent && parent.options && parent.options.promiseLibrary) {
        return PromiseProvider.validate(parent.options.promiseLibrary);
      }
      if (parent && parent.s && parent.s.promiseLibrary) {
        return PromiseProvider.validate(parent.s.promiseLibrary);
      }
      if (parent && parent.clientOptions && parent.clientOptions.promiseLibrary) {
        return PromiseProvider.validate(parent.clientOptions.promiseLibrary);
      }
      return null;
    }, null);
    return result || store[kPromise];
  }
}

module.exports = PromiseProvider;
