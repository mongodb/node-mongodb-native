'use strict';

class ES6GeneratorsSupportedFilter {
  beforeStart(object, callback) {
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.generators) return true;

    try {
      eval('(function *(){})'); // eslint-disable-line
      return true;
    } catch (err) {} // eslint-disable-line

    return false;
  }
}

module.exports = ES6GeneratorsSupportedFilter;
