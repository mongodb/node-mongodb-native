const kPromise = Symbol('promise');

interface PromiseStore {
  [kPromise]?: PromiseConstructor;
}

const store: PromiseStore = {
  [kPromise]: undefined
};

/**
 * @public
 * Global promise store allowing user-provided promises
 */
export class PromiseProvider {
  /** Validates the passed in promise library */
  static validate(lib: any): lib is PromiseConstructor {
    if (typeof lib !== 'function') throw new Error(`Promise must be a function, got ${lib}`);
    return lib;
  }

  /** Sets the promise library */
  static set(lib: PromiseConstructor): void {
    if (!PromiseProvider.validate(lib)) {
      // validate
      return;
    }
    store[kPromise] = lib;
  }

  /** Get the stored promise library, or resolves passed in */
  static get(): PromiseConstructor {
    return store[kPromise] as PromiseConstructor;
  }
}

PromiseProvider.set(global.Promise);
