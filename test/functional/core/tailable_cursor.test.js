'use strict';
const expect = require('chai').expect;
const setupDatabase = require('./shared').setupDatabase;

describe('Tailable cursor tests', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly perform awaitdata', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const self = this;
      const topology = this.configuration.newTopology();
      const ns = `${this.configuration.db}.cursor_tailable`;

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          // Create a capped collection
          server.command(
            `${self.configuration.db}.$cmd`,
            { create: 'cursor_tailable', capped: true, size: 10000 },
            (cmdErr, cmdRes) => {
              expect(cmdErr).to.not.exist;
              expect(cmdRes).to.exist;

              // Execute the write
              server.insert(
                ns,
                [{ a: 1 }],
                {
                  writeConcern: { w: 1 },
                  ordered: true
                },
                (insertErr, results) => {
                  expect(insertErr).to.not.exist;
                  expect(results.n).to.equal(1);

                  // Execute find
                  const cursor = topology.cursor(ns, {
                    find: 'cursor_tailable',
                    filter: {},
                    batchSize: 2,
                    tailable: true,
                    awaitData: true
                  });

                  // Execute next
                  cursor._next((cursorErr, cursorD) => {
                    expect(cursorErr).to.not.exist;
                    expect(cursorD).to.exist;

                    const s = new Date();
                    cursor._next(() => {
                      const e = new Date();
                      expect(e.getTime() - s.getTime()).to.be.at.least(300);

                      // Destroy the server connection
                      server.destroy(done);
                    });

                    setTimeout(() => cursor.kill(), 300);
                  });
                }
              );
            }
          );
        });
      });
    }
  });
});
