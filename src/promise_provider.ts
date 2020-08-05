const kPromise = Symbol('promise');

const store = {
  [kPromise]: undefined
};

/** global promise store allowing user-provided promises */
export class PromiseProvider {
  /**
   * validates the passed in promise library
   *
   * @param {Function} lib promise implementation
   */
  static validate(lib: Function) {
    if (typeof lib !== 'function') throw new Error(`Promise must be a function, got ${lib}`);
    return lib;
  }

  /**
   * sets the promise library
   *
   * @param {Function} lib promise implementation
   */
  static set(lib: Function) {
    (store as any)[kPromise] = PromiseProvider.validate(lib);
  }

  /**
   * get the stored promise library, or resolves passed in
   *
   * @returns {any}
   */
  static get(): any {
    return store[kPromise];
  }
}

PromiseProvider.set(global.Promise);
