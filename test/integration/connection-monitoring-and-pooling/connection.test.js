'use strict';

const { Connection } = require('../../../src/cmap/connection');
const { connect } = require('../../../src/cmap/connect');
const { expect } = require('chai');
const { setupDatabase } = require('../shared');
const { ns, HostAddress } = require('../../../src/utils');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

describe('Connection - functional/cmap', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should execute a command against a server', {
    metadata: { requires: { apiVersion: false } },
    test: function (done) {
      const connectOptions = Object.assign(
        { connectionType: Connection },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined, (err, hello) => {
          expect(err).to.not.exist;
          expect(hello).to.exist;
          expect(hello.ok).to.equal(1);
          done();
        });
      });
    }
  });

  it('should emit command monitoring events', {
    metadata: { requires: { apiVersion: false } },
    test: function (done) {
      const connectOptions = Object.assign(
        { connectionType: Connection, monitorCommands: true },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        const events = [];
        conn.on('commandStarted', event => events.push(event));
        conn.on('commandSucceeded', event => events.push(event));
        conn.on('commandFailed', event => events.push(event));

        conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined, (err, hello) => {
          expect(err).to.not.exist;
          expect(hello).to.exist;
          expect(hello.ok).to.equal(1);
          expect(events).to.have.length(2);
          done();
        });
      });
    }
  });

  it.skip('should support socket timeouts', {
    // FIXME: NODE-2941
    metadata: {
      requires: {
        os: '!win32' // 240.0.0.1 doesnt work for windows
      }
    },
    test: function (done) {
      const connectOptions = {
        hostAddress: new HostAddress('240.0.0.1'),
        connectionType: Connection,
        connectionTimeout: 500
      };

      connect(connectOptions, err => {
        expect(err).to.exist;
        expect(err).to.match(/timed out/);
        done();
      });
    }
  });

  it('should support calling back multiple times on exhaust commands', {
    metadata: { requires: { apiVersion: false, mongodb: '>=4.2.0', topology: ['single'] } },
    test: function (done) {
      const namespace = ns(`${this.configuration.db}.$cmd`);
      const connectOptions = Object.assign(
        { connectionType: Connection },
        this.configuration.options
      );

      connect(connectOptions, (err, conn) => {
        expect(err).to.not.exist;
        this.defer(_done => conn.destroy(_done));

        const documents = Array.from(Array(10000), (_, idx) => ({
          test: Math.floor(Math.random() * idx)
        }));

        conn.command(namespace, { drop: 'test' }, undefined, () => {
          conn.command(namespace, { insert: 'test', documents }, undefined, (err, res) => {
            expect(err).to.not.exist;
            expect(res).nested.property('n').to.equal(documents.length);

            let totalDocumentsRead = 0;
            conn.command(namespace, { find: 'test', batchSize: 100 }, undefined, (err, result) => {
              expect(err).to.not.exist;
              expect(result).nested.property('cursor').to.exist;
              const cursor = result.cursor;
              totalDocumentsRead += cursor.firstBatch.length;

              conn.command(
                namespace,
                { getMore: cursor.id, collection: 'test', batchSize: 100 },
                { exhaustAllowed: true },
                (err, result) => {
                  expect(err).to.not.exist;
                  expect(result).nested.property('cursor').to.exist;
                  const cursor = result.cursor;
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
      });
    }
  });
});
