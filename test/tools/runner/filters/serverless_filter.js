'use strict';

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

  initializeFilter(client, context, callback) {
    if (this.serverless) {
      console.log('saving serverless credentials in test filter');
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
    const serverless = test.metadata.requires.serverless;
    if (!serverless) return true;
    switch (serverless) {
      case 'forbid':
        // return true if the configuration is NOT serverless
        return !this.serverless;
      case 'allow':
        // always return true
        return true;
      case 'require':
        // only return true if the configuration is serverless
        return this.serverless;
      default:
        throw new Error(`Invalid serverless filter: ${serverless}`);
    }
  }
}

module.exports = ServerlessFilter;
