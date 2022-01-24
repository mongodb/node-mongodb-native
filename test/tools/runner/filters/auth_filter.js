'use strict';

/**
 * Filter for the MongoDB API Version required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      auth: 'enabled' | 'disabled'
 *    }
 * }
 */
class ApiVersionFilter {
  constructor() {
    // Get environmental variables that are known
    this.isAuthEnabled = process.env.AUTH === 'auth';
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    const auth = test.metadata.requires.auth;

    // setting to false skips this test when an apiVersion is required
    if (auth === 'enabled') {
      return this.isAuthEnabled;
    } else if (auth === 'disabled') {
      return !this.isAuthEnabled;
    }

    return false;
  }
}

module.exports = ApiVersionFilter;
