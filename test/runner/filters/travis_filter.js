'use strict';

/**
 * Filter for whether Travis should run the test
 *
 * example:
 * metadata: {
 *    ignore: {
 *      travis: true | false
 *    }
 * }
 */
class TravisFilter {
  constructor(name) {
    this.name = name || 'TRAVIS_JOB_ID';
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.ignore) return true;
    if (!test.metadata.ignore.travis) return true;
    if (process.env[this.name] !== null && test.metadata.ignore.travis === true) return false;
    return true;
  }
}

module.exports = TravisFilter;
