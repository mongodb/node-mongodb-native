'use strict';
const { expect } = require('chai');
const { ConnectionPoolMetrics } = require('../../mongodb');

describe('ConnectionPoolMetrics', function () {
  describe('#constructor', function () {
    const metrics = new ConnectionPoolMetrics();

    it('defaults txnConnections to zero', function () {
      expect(metrics).property('txnConnections').to.equal(0);
    });

    it('defaults cursorConnections to zero', function () {
      expect(metrics).property('cursorConnections').to.equal(0);
    });

    it('defaults otherConnections to zero', function () {
      expect(metrics).property('otherConnections').to.equal(0);
    });
  });

  describe('#info', function () {
    const metrics = new ConnectionPoolMetrics();

    it('returns the metrics information', function () {
      expect(metrics.info(5)).to.equal(
        'Timed out while checking out a connection from connection pool: ' +
          'maxPoolSize: 5, ' +
          'connections in use by cursors: 0, ' +
          'connections in use by transactions: 0, ' +
          'connections in use by other operations: 0'
      );
    });
  });

  describe('#markPinned', function () {
    const metrics = new ConnectionPoolMetrics();

    describe('when the type is TXN', function () {
      before(function () {
        metrics.reset();
        metrics.markPinned(ConnectionPoolMetrics.TXN);
      });

      it('increments the txnConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: 1,
          cursorConnections: 0,
          otherConnections: 0
        });
      });
    });

    describe('when the type is CURSOR', function () {
      before(function () {
        metrics.reset();
        metrics.markPinned(ConnectionPoolMetrics.CURSOR);
      });

      it('increments the cursorConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: 0,
          cursorConnections: 1,
          otherConnections: 0
        });
      });
    });

    describe('when the type is OTHER', function () {
      before(function () {
        metrics.reset();
        metrics.markPinned(ConnectionPoolMetrics.OTHER);
      });

      it('increments the otherConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: 0,
          cursorConnections: 0,
          otherConnections: 1
        });
      });
    });
  });

  describe('#markUnpinned', function () {
    const metrics = new ConnectionPoolMetrics();

    describe('when the type is TXN', function () {
      before(function () {
        metrics.reset();
        metrics.markUnpinned(ConnectionPoolMetrics.TXN);
      });

      it('decrements the txnConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: -1,
          cursorConnections: 0,
          otherConnections: 0
        });
      });
    });

    describe('when the type is CURSOR', function () {
      before(function () {
        metrics.reset();
        metrics.markUnpinned(ConnectionPoolMetrics.CURSOR);
      });

      it('decrements the cursorConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: 0,
          cursorConnections: -1,
          otherConnections: 0
        });
      });
    });

    describe('when the type is OTHER', function () {
      before(function () {
        metrics.reset();
        metrics.markUnpinned(ConnectionPoolMetrics.OTHER);
      });

      it('decrements the otherConnections count', function () {
        expect(metrics).to.deep.equal({
          txnConnections: 0,
          cursorConnections: 0,
          otherConnections: -1
        });
      });
    });
  });
});
