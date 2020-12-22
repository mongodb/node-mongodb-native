'use strict';
var test = require('./shared').assert;
const { expect } = require('chai');
var setupDatabase = require('./shared').setupDatabase;

describe('MaxTimeMS', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should Correctly respect the maxtimeMs property on count', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      disabled: true,
      requires: {
        mongodb: '>2.5.5',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var col = db.collection('max_time_ms');

        // Insert a couple of docs
        var docs_1 = [{ agg_pipe: 1 }];

        // Simple insert
        col.insert(docs_1, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          // Execute a find command
          col
            .find({ $where: 'sleep(100) || true' })
            .maxTimeMS(50)
            .count(function (err) {
              test.ok(err != null);
              client.close(done);
            });
        });
      });
    }
  });

  it('Should Correctly respect the maxtimeMs property on toArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      disabled: true,
      requires: {
        topology: ['single', 'replicaset'],
        mongodb: '>2.5.5'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var col = db.collection('max_time_ms_2');

        // Insert a couple of docs
        var docs_1 = [{ agg_pipe: 1 }];

        // Simple insert
        col.insert(docs_1, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          // Execute a find command
          col
            .find({ $where: 'sleep(100) || true' })
            .maxTimeMS(50)
            .toArray(function (err) {
              test.ok(err != null);
              client.close(done);
            });
        });
      });
    }
  });

  it('Should Correctly fail with maxTimeMS error', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        topology: ['single', 'replicaset'],
        mongodb: '>2.5.5'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var col = db.collection('max_time_ms_5');

        // Insert a couple of docs
        var docs_1 = [{ agg_pipe: 10 }];

        // Simple insert
        col.insert(docs_1, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          db.admin().command(
            { configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'alwaysOn' },
            function (err, result) {
              expect(err).to.not.exist;
              test.equal(1, result.ok);

              col
                .find({})
                .maxTimeMS(10)
                .toArray(function (err) {
                  test.ok(err != null);

                  db.admin().command(
                    { configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'off' },
                    function (err, result) {
                      expect(err).to.not.exist;
                      test.equal(1, result.ok);
                      client.close(done);
                    }
                  );
                });
            }
          );
        });
      });
    }
  });
});
