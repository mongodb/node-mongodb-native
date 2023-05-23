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
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.nodejs) return true;

    return satisfies(process.version, test.metadata.requires.nodejs);
  }
}

module.exports = NodeVersionFilter;
