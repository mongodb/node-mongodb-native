'use strict';

const semver = require('semver');
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
      if (err) throw new Error(err);
      client.db('admin').command({ buildInfo: true }, (err, result) => {
        if (err) throw new Error(err);
        this.mongoVersion = result.version;
        client.close(callback);
      });
    });
  }

  filter(test) {
    if (!(test && test.metadata && test.metadata.requires && test.metadata.requires.mongodb)) {
      return true;
    }
    return semver.satisfies(this.mongoVersion, test.metadata.requires.mongodb);
  }
}

module.exports = MongoDBVersionFilter;
