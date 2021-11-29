'use strict';

/**
 * Filter for the MongoDB API Version required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      apiVersion: '1'
 *    }
 * }
 */
class ApiVersionFilter {
  constructor() {
    // Get environmental variables that are known
    this.apiVersion = process.env.MONGODB_API_VERSION;
  }

  get name() {
    return this.constructor.name;
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    const apiVersion = test.metadata.requires.apiVersion;

    // setting to false skips this test when an apiVersion is required
    if (apiVersion === false) return !this.apiVersion;
    // setting to true requires some apiVersion be specified
    if (apiVersion === true) return !!this.apiVersion;

    // if there's no metadata requirement, always run
    if (apiVersion == null) return true;

    // otherwise attempt a direct match
    return apiVersion === this.apiVersion;
  }
}

module.exports = ApiVersionFilter;
