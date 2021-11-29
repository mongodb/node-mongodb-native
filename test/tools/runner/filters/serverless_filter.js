'use strict';
const { shouldRunServerlessTest } = require('../../utils');

/**
 * Filter to allow to tests to run on serverless
 *
 * example:
 * metadata: {
 *    requires: {
 *      serverless: 'forbid'
 *    }
 * }
 */
class ServerlessFilter {
  constructor() {
    // Get environmental variables that are known
    this.serverless = !!process.env.SERVERLESS;
  }

  get name() {
    return this.constructor.name;
  }

  initializeFilter(client, context, callback) {
    if (this.serverless) {
      context.serverlessCredentials = {
        username: process.env.SERVERLESS_ATLAS_USER,
        password: process.env.SERVERLESS_ATLAS_PASSWORD
      };
    }
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    return shouldRunServerlessTest(test.metadata.requires.serverless, this.serverless);
  }
}

module.exports = ServerlessFilter;
