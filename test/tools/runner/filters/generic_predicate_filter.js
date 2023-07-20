'use strict';

/**
 * Generic filter than can run predicates.
 *
 * Predicates cannot be async.  The test is skipped if the predicate returns
 * a string.  The string returned should be a skip reason.
 *
 * example:
 * metadata: {
 *    requires: {
 *      predicate: (test: Mocha.Test) => true | string
 *    }
 * }
 */

class GenericPredicateFilter {
  filter(test) {
    /** @type{ ((test?: Mocha.Test) => string | true) | undefined } */
    const predicate = test?.metadata?.requires?.predicate;

    return predicate?.(test) ?? true;
  }
}

module.exports = GenericPredicateFilter;
