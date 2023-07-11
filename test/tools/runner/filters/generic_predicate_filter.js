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
    const predicate = test?.metadata?.requires?.predicate;
    if (typeof predicate !== 'function') {
      return false;
    }

    return predicate(test);
  }
}

module.exports = GenericPredicateFilter;
