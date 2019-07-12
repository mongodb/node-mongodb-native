'use strict';

const semver = require('semver');
const f = require('util').format;

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

  beforeStart(configuration, callback) {
    const self = this;
    if (this.options.skip) {
      return callback();
    }

    if (configuration.type === 'core') {
      configuration.newConnection({ w: 1 }, function(err, topology) {
        if (err) {
          callback(err);
          return;
        }

        topology.command(f('%s.$cmd', configuration.db), { buildInfo: true }, function(
          commandErr,
          result
        ) {
          if (commandErr) throw commandErr;
          self.version = result.result.version;
          console.log('running against mongodb version:');
          console.dir(result.result);

          topology.destroy();
          callback();
        });
      });
    } else {
      configuration.newClient({ w: 1 }).connect(function(err, client) {
        if (err) {
          callback(err);
          return;
        }

        client.db('admin').command({ buildInfo: true }, function(_err, result) {
          if (_err) {
            callback(_err);
            return;
          }

          self.version = result.versionArray.slice(0, 3).join('.');
          console.log('running against mongodb version:');
          console.dir(result);

          client.close();
          callback();
        });
      });
    }
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
