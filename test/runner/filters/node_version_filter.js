'use strict';

const semver = require('semver');

/**
 * Filter for the Node version required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      node: 'nodeSemverVersion'
 *    }
 * }
 */
class NodeVersionFilter {
  constructor() {
    this.version = process.version;
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.node) return true;

    // Return if this is a valid method
    return semver.satisfies(this.version, test.metadata.requires.node);
  }
}

module.exports = NodeVersionFilter;
