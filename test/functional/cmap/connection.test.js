'use strict';

const Connection = require('../../../lib/cmap/connection').Connection;
const connect = require('../../../lib/core/connection/connect');
const expect = require('chai').expect;
const BSON = require('bson');
const setupDatabase = require('../../functional/shared').setupDatabase;

describe('Connection', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should execute a command against a server', {
    metadata: { requires: { apiVersion: false } },
    test: function(done) {
      const connectOptions = Object.assign(
        { connectionType: Connection, bson: new BSON() },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        conn.command('admin.$cmd', { ismaster: 1 }, (err, result) => {
          // NODE-2382: remove `result.result` when command returns just a raw response
          const ismaster = result.result;

          expect(err).to.not.exist;
          expect(ismaster).to.exist;
          expect(ismaster.ok).to.equal(1);
          done();
        });
      });
    }
  });

  it('should emit command monitoring events', {
    metadata: { requires: { apiVersion: false } },
    test: function(done) {
      const connectOptions = Object.assign(
        { connectionType: Connection, bson: new BSON(), monitorCommands: true },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        const events = [];
        conn.on('commandStarted', event => events.push(event));
        conn.on('commandSucceeded', event => events.push(event));
        conn.on('commandFailed', event => events.push(event));

        conn.command('admin.$cmd', { ismaster: 1 }, (err, result) => {
          // NODE-2382: remove `result.result` when command returns just a raw response
          const ismaster = result.result;

          expect(err).to.not.exist;
          expect(ismaster).to.exist;
          expect(ismaster.ok).to.equal(1);
          expect(events).to.have.length(2);
          done();
        });
      });
    }
  });

  it.skip('should support socket timeouts', {
    metadata: {
      requires: {
        apiVersion: false,
        os: '!win32' // NODE-2941: 240.0.0.1 doesnt work for windows
      }
    },
    test: function(done) {
      const connectOptions = Object.assign({
        host: '240.0.0.1',
        connectionType: Connection,
        bson: new BSON(),
        connectionTimeout: 500
      });

      connect(connectOptions, err => {
        expect(err).to.exist;
        expect(err).to.match(/timed out/);
        done();
      });
    }
  });

  it('should support calling back multiple times on exhaust commands', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: ['single'], apiVersion: false } },
    test: function(done) {
      const ns = `${this.configuration.db}.$cmd`;
      const connectOptions = Object.assign(
        { connectionType: Connection, bson: new BSON() },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        const documents = Array.from(Array(10000), (_, idx) => ({
          test: Math.floor(Math.random() * idx)
        }));

        conn.command(ns, { insert: 'test', documents }, (err, res) => {
          expect(err).to.not.exist;
          expect(res)
            .nested.property('result.n')
            .to.equal(documents.length);

          let totalDocumentsRead = 0;
          conn.command(ns, { find: 'test', batchSize: 100 }, (err, result) => {
            expect(err).to.not.exist;
            expect(result).nested.property('result.cursor').to.exist;
            const cursor = result.result.cursor;
            totalDocumentsRead += cursor.firstBatch.length;

            conn.command(
              ns,
              { getMore: cursor.id, collection: 'test', batchSize: 100 },
              { exhaustAllowed: true },
              (err, result) => {
                expect(err).to.not.exist;
                expect(result).nested.property('result.cursor').to.exist;
                const cursor = result.result.cursor;
                totalDocumentsRead += cursor.nextBatch.length;

                if (cursor.id === 0 || cursor.id.isZero()) {
                  expect(totalDocumentsRead).to.equal(documents.length);
                  done();
                }
              }
            );
          });
        });
      });
    }
  });
});
