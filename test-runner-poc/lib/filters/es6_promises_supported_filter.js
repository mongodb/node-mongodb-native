'use strict';

class ES6PromisesSupportedFilter {
  filter(test) {
    if (!(test.metadata && test.metadata.requires && test.metadata.requires.promises)) {
      return true;
    }

    let check = false;

    try {
      const promise = new Promise(function() {}); // eslint-disable-line
      check = true;
    } catch (err) {} // eslint-disable-line

    return check;
  }
}

module.exports = ES6PromisesSupportedFilter;
