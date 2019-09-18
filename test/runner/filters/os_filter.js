'use strict';

/**
 * Filter for the OS required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      os: 'osName'
 *    }
 * }
 */
class OSFilter {
  constructor() {
    // Get environmental variables that are known
    this.platform = process.platform;
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.os) return true;

    // Get the os
    const os = test.metadata.requires.os;
    if (os === this.platform) return true;
    // If !platform only allow running if the platform match
    if (os[0] === '!' && os !== '!' + this.platform) return true;
    return false;
  }
}

module.exports = OSFilter;
