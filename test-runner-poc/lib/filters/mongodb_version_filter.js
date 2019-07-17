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
    const self = this;
    const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018');
    mongoClient.connect((err, client) => {
      client.db('admin').command({buildInfo: true}, (err, result) => {
        console.log("version: ",result.version);
        self.version = result.version;
        console.log(" self.version ",self.version);
        client.close();
        callback();
      });
    })

  }

  constructor(options) {
    this.options = options || {};
    //this.version = options.version || 0;
  }

  filter(test) {
    if (this.options.skip) return true;
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.mongodb) return true;
    console.log("this.version: ",this.version)

    return semver.satisfies(this.version, test.metadata.requires.mongodb);
  }
}

module.exports = MongoDBVersionFilter;
