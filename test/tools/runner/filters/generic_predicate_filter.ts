/**
 * Generic filter than can run predicates.
 *
 * Predicates cannot be async.  The test is skipped if the predicate returns
 * a string.  The string returned should be a skip reason.
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      predicate: (test: Mocha.Test) => true | string
 *    }
 * }
 * ```
 */

import { type Test } from 'mocha';

import { Filter } from './filter';

export class GenericPredicateFilter extends Filter {
  filter(test: Test & { metadata?: MongoDBMetadataUI }) {
    const predicate = test?.metadata?.requires?.predicate;
    return predicate?.(test) ?? true;
  }
}
