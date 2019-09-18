'use strict';

class ES6GeneratorsSupportedFilter {
  beforeStart(object, callback) {
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.generators) return true;
    let check = false;

    try {
      eval('(function *(){})'); // eslint-disable-line
      check = true;
    } catch (err) {} // eslint-disable-line

    // Do not execute the test
    return check;
  }
}

module.exports = ES6GeneratorsSupportedFilter;
