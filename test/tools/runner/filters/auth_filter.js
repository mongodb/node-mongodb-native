'use strict';

/**
 * Filter for authorization enabled or disabled on the server
 *
 * example:
 * metadata: {
 *    requires: {
 *      auth: 'enabled' | 'disabled'
 *    }
 * }
 */
class AuthFilter {
  constructor() {
    this.isAuthEnabled = process.env.AUTH === 'auth';
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.auth) return true;

    const auth = test.metadata.requires.auth;

    if (auth === 'enabled') {
      return this.isAuthEnabled;
    } else if (auth === 'disabled') {
      return !this.isAuthEnabled;
    }

    throw new Error(
      "Invalid value for 'auth' filter.  'auth' must be set to 'enabled' or 'disabled'."
    );
  }
}

module.exports = AuthFilter;
