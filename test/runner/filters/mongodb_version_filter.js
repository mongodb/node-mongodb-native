'use strict';

const semver = require('semver');

/**
 * Filter for the MongoDB version required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      mongodb: 'mongodbSemverVersion'
 *    }
 * }
 */
class MongoDBVersionFilter {
  constructor(options) {
    this.options = options || {};
    this.version = null;
  }

  initializeFilter(client, context, callback) {
    if (this.options.skip) {
      callback();
      return;
    }

    client.db('admin').command({ buildInfo: true }, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      context.version = this.version = result.versionArray.slice(0, 3).join('.');
      console.log('running against mongodb version:');
      console.dir(result);

      callback();
    });
  }

  filter(test) {
    if (this.options.skip) return true;
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.mongodb) return true;
    return semver.satisfies(this.version, test.metadata.requires.mongodb);
  }
}

module.exports = MongoDBVersionFilter;
