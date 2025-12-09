import * as process from 'node:process';

import { Filter } from './filter';

/**
 * Filter for authorization enabled or disabled on the server
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      auth: 'enabled' | 'disabled'
 *    }
 * }
 * ```
 */
export class AuthFilter extends Filter {
  isAuthEnabled: boolean;
  constructor() {
    super();
    this.isAuthEnabled = process.env.AUTH === 'auth';
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
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
