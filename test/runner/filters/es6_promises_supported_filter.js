'use strict';

class ES6PromisesSupportedFilter {
  beforeStart(object, callback) {
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.promises) return true;

    try {
      const promise = new Promise(function() {}); // eslint-disable-line
      return true;
    } catch (err) {} // eslint-disable-line

    return false;
  }
}

module.exports = ES6PromisesSupportedFilter;
