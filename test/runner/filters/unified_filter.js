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
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (typeof test.metadata.requires.unifiedTopology !== 'boolean') return true;

    const requireUnifiedTopology = !!test.metadata.requires.unifiedTopology;
    return requireUnifiedTopology === !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }
}

module.exports = UnifiedTopologyFilter;
