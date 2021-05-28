'use strict';

const { expect } = require('chai');
const { Metrics } = require('../../../src/cmap/metrics');

describe('Metrics', function () {
  describe('#constructor', function () {
    const metrics = new Metrics();

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
    const metrics = new Metrics();

    it('returns the metrics information', function () {
      expect(metrics.info()).to.equal(
        'connections in use by cursors: 0,' +
          'connections in use by transactions: 0,' +
          'connections in use by other operations: 0'
      );
    });
  });

  describe('#markPinned', function () {
    const metrics = new Metrics();

    context('when the type is TXN', function () {
      before(function () {
        metrics.markPinned(Metrics.TXN);
      });

      it('increments the txnConnections count', function () {
        expect(metrics.txnConnections).to.equal(1);
      });
    });

    context('when the type is CURSOR', function () {
      before(function () {
        metrics.markPinned(Metrics.CURSOR);
      });

      it('increments the cursorConnections count', function () {
        expect(metrics.cursorConnections).to.equal(1);
      });
    });

    context('when the type is OTHER', function () {
      before(function () {
        metrics.markPinned(Metrics.OTHER);
      });

      it('increments the otherConnections count', function () {
        expect(metrics.otherConnections).to.equal(1);
      });
    });
  });

  describe('#markUnpinned', function () {
    const metrics = new Metrics();

    context('when the type is TXN', function () {
      before(function () {
        metrics.markUnpinned(Metrics.TXN);
      });

      it('increments the txnConnections count', function () {
        expect(metrics.txnConnections).to.equal(-1);
      });
    });

    context('when the type is CURSOR', function () {
      before(function () {
        metrics.markUnpinned(Metrics.CURSOR);
      });

      it('increments the cursorConnections count', function () {
        expect(metrics.cursorConnections).to.equal(-1);
      });
    });

    context('when the type is OTHER', function () {
      before(function () {
        metrics.markUnpinned(Metrics.OTHER);
      });

      it('increments the otherConnections count', function () {
        expect(metrics.otherConnections).to.equal(-1);
      });
    });
  });
});
