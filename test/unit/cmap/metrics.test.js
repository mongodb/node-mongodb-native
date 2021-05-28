'use strict';

const { expect } = require('chai');
const { ConnectionPoolMetrics } = require('../../../src/cmap/metrics');

describe('ConnectionPoolMetrics', function () {
  describe('#constructor', function () {
    const metrics = new ConnectionPoolMetrics();

    it('defaults txnConnections to zero', function () {
      expect(metrics.txnConnections).to.equal(0);
    });

    it('defaults cursorConnections to zero', function () {
      expect(metrics.cursorConnections).to.equal(0);
    });

    it('defaults otherConnections to zero', function () {
      expect(metrics.otherConnections).to.equal(0);
    });
  });

  describe('#info', function () {
    const metrics = new ConnectionPoolMetrics();

    it('returns the metrics information', function () {
      expect(metrics.info()).to.equal(
        'connections in use by cursors: 0,' +
          'connections in use by transactions: 0,' +
          'connections in use by other operations: 0'
      );
    });
  });

  describe('#markPinned', function () {
    const metrics = new ConnectionPoolMetrics();

    context('when the type is TXN', function () {
      before(function () {
        metrics.markPinned(ConnectionPoolMetrics.TXN);
      });

      it('increments the txnConnections count', function () {
        expect(metrics.txnConnections).to.equal(1);
      });
    });

    context('when the type is CURSOR', function () {
      before(function () {
        metrics.markPinned(ConnectionPoolMetrics.CURSOR);
      });

      it('increments the cursorConnections count', function () {
        expect(metrics.cursorConnections).to.equal(1);
      });
    });

    context('when the type is OTHER', function () {
      before(function () {
        metrics.markPinned(ConnectionPoolMetrics.OTHER);
      });

      it('increments the otherConnections count', function () {
        expect(metrics.otherConnections).to.equal(1);
      });
    });
  });

  describe('#markUnpinned', function () {
    const metrics = new ConnectionPoolMetrics();

    context('when the type is TXN', function () {
      before(function () {
        metrics.markUnpinned(ConnectionPoolMetrics.TXN);
      });

      it('increments the txnConnections count', function () {
        expect(metrics.txnConnections).to.equal(-1);
      });
    });

    context('when the type is CURSOR', function () {
      before(function () {
        metrics.markUnpinned(ConnectionPoolMetrics.CURSOR);
      });

      it('increments the cursorConnections count', function () {
        expect(metrics.cursorConnections).to.equal(-1);
      });
    });

    context('when the type is OTHER', function () {
      before(function () {
        metrics.markUnpinned(ConnectionPoolMetrics.OTHER);
      });

      it('increments the otherConnections count', function () {
        expect(metrics.otherConnections).to.equal(-1);
      });
    });
  });
});
