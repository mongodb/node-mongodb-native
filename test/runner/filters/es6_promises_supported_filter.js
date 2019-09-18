'use strict';

class ES6PromisesSupportedFilter {
  beforeStart(object, callback) {
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.promises) return true;
    let check = false;

    try {
      const promise = new Promise(function() {}); // eslint-disable-line
      check = true;
    } catch (err) {} // eslint-disable-line

    return check;
  }
}

module.exports = ES6PromisesSupportedFilter;
