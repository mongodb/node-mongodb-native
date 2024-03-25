import { satisfies } from 'semver';

import { Filter } from './filter';

/**
 * Filter for specific nodejs versions
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      nodejs: '>=14'
 *    }
 * }
 * ```
 */
export class NodeVersionFilter extends Filter {
  filter(test: { metadata?: MongoDBMetadataUI }) {
    const nodeVersionRange = test?.metadata?.requires?.nodejs;
    if (!nodeVersionRange) {
      return true;
    }

    return satisfies(process.version, nodeVersionRange);
  }
}
