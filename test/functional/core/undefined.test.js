'use strict';

const { expect } = require('chai');
const { format: f } = require('util');
const { ObjectId } = require('bson');
const { FindCursor } = require('../../../src/cursor/find_cursor');
const { MongoDBNamespace } = require('../../../src/utils');

describe('A server', function () {
  it('should correctly execute insert culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const self = this;
      const topology = this.configuration.newTopology();

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          // Drop collection
          server.command(f('%s.$cmd', self.configuration.db), { drop: 'insert1' }, () => {
            const ns = f('%s.insert1', self.configuration.db);
            const objectId = new ObjectId();
            // Execute the write
            server.insert(
              ns,
              [{ _id: objectId, a: 1, b: undefined }],
              {
                writeConcern: { w: 1 },
                ordered: true,
                ignoreUndefined: true
              },
              (insertErr, results) => {
                expect(insertErr).to.not.exist;
                expect(results.n).to.eql(1);

                // Execute find
                const cursor = new FindCursor(
                  topology,
                  MongoDBNamespace.fromString(ns),
                  { _id: objectId },
                  { batchSize: 2 }
                );

                // Execute next
                cursor.next((nextErr, d) => {
                  expect(nextErr).to.not.exist;
                  expect(d.b).to.be.undefined;

                  // Destroy the connection
                  server.destroy(done);
                });
              }
            );
          });
        });
      });
    }
  });

  it('should correctly execute update culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      var self = this;
      const topology = this.configuration.newTopology();

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          // Drop collection
          server.command(f('%s.$cmd', self.configuration.db), { drop: 'update1' }, () => {
            const ns = f('%s.update1', self.configuration.db);
            const objectId = new ObjectId();
            // Execute the write
            server.update(
              ns,
              {
                q: { _id: objectId, a: 1, b: undefined },
                u: { $set: { a: 1, b: undefined } },
                upsert: true
              },
              {
                writeConcern: { w: 1 },
                ordered: true,
                ignoreUndefined: true
              },
              (insertErr, results) => {
                expect(insertErr).to.not.exist;
                expect(results.n).to.eql(1);

                // Execute find
                const cursor = new FindCursor(
                  topology,
                  MongoDBNamespace.fromString(ns),
                  { _id: objectId },
                  { batchSize: 2 }
                );

                // Execute next
                cursor.next((nextErr, d) => {
                  expect(nextErr).to.not.exist;
                  expect(d.b).to.be.undefined;

                  // Destroy the connection
                  server.destroy(done);
                });
              }
            );
          });
        });
      });
    }
  });

  it('should correctly execute remove culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const self = this;
      const topology = this.configuration.newTopology();
      const ns = f('%s.remove1', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          const objectId = new ObjectId();
          server.command(f('%s.$cmd', self.configuration.db), { drop: 'remove1' }, () => {
            // Execute the write
            server.insert(
              ns,
              [
                { id: objectId, a: 1, b: undefined },
                { id: objectId, a: 2, b: 1 }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              (insertErr, results) => {
                expect(insertErr).to.not.exist;
                expect(results.n).to.eql(2);

                // Execute the write
                server.remove(
                  ns,
                  [
                    {
                      q: { b: undefined },
                      limit: 0
                    }
                  ],
                  {
                    writeConcern: { w: 1 },
                    ordered: true,
                    ignoreUndefined: true
                  },
                  (removeErr, removeResults) => {
                    expect(removeErr).to.not.exist;
                    expect(removeResults.n).to.eql(2);

                    // Destroy the connection
                    server.destroy(done);
                  }
                );
              }
            );
          });
        });
      });
    }
  });

  it('should correctly execute remove not culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const self = this;
      const topology = this.configuration.newTopology();
      const ns = f('%s.remove2', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          const objectId = new ObjectId();
          server.command(f('%s.$cmd', self.configuration.db), { drop: 'remove2' }, () => {
            // Execute the write
            server.insert(
              ns,
              [
                { id: objectId, a: 1, b: undefined },
                { id: objectId, a: 2, b: 1 }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              (insertErr, results) => {
                expect(insertErr).to.not.exist;
                expect(results.n).to.eql(2);

                // Execute the write
                server.remove(
                  ns,
                  [
                    {
                      q: { b: null },
                      limit: 0
                    }
                  ],
                  {
                    writeConcern: { w: 1 },
                    ordered: true
                  },
                  (removeErr, removeResults) => {
                    expect(removeErr).to.not.exist;
                    expect(removeResults.n).to.eql(1);

                    // Destroy the connection
                    server.destroy();
                    // Finish the test
                    done();
                  }
                );
              }
            );
          });
        });
      });
    }
  });
});
