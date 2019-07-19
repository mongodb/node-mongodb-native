'use strict';

const semver = require('semver');
const f = require('util').format;
const MongoClient = require('mongodb').MongoClient;

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
  initializeFilter(callback) {
    const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
    mongoClient.connect((err, client) => {
      client.db('admin').command({buildInfo: true}, (err, result) => {
        this.version = result.version;
        client.close(callback);
      });
    })

  }

  constructor(options) {
    this.options = options || {};
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
