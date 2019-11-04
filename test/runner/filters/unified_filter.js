'use strict';

/**
 * Filter for tests that require the unified topology
 *
 * example:
 * metadata: {
 *    requires: {
 *      unifiedTopology: <boolean>
 *    }
 * }
 */
class UnifiedTopologyFilter {
  filter(test) {
    const unifiedTopology =
      test.metadata && test.metadata.requires && test.metadata.requires.unifiedTopology;

    return (
      typeof unifiedTopology !== 'boolean' ||
      unifiedTopology === process.env.MONGODB_UNIFIED_TOPOLOGY
    );
  }
}

module.exports = UnifiedTopologyFilter;
