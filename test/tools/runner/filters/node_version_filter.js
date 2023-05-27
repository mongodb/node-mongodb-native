'use strict';

const { satisfies } = require('semver');

/**
 * Filter for specific nodejs versions
 *
 * example:
 * metadata: {
 *    requires: {
 *      nodejs: '>=14'
 *    }
 * }
 */
class NodeVersionFilter {
  filter(test) {
    const nodeVersionRange = test?.metadata?.requires?.nodejs;
    if (!nodeVersionRange) {
      return true;
    }

    return satisfies(process.version, nodeVersionRange);
  }
}

module.exports = NodeVersionFilter;
