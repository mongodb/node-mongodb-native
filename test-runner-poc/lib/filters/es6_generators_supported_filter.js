'use strict';

class ES6GeneratorsSupportedFilter {
  filter(test) {
    if (!(test.metadata && test.metadata.requires && test.metadata.requires.generators)) {
      return true;
    }

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
