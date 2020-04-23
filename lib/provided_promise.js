'use strict';

const assert = require('assert');

class ProvidedPromise {
  set Promise(lib) {
    assert.ok(typeof lib === 'function', `mongodb.Promise must be a function, got ${lib}`);
    this._promise = lib;
  }
  get Promise() {
    return this._promise;
  }
}

const provided = new ProvidedPromise();
provided.Promise = global.Promise;

module.exports = provided;
