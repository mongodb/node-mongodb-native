'use strict';

const mock = require('../../tools/mock');
const { connect } = require('../../../src/cmap/connect');
const { Connection, hasSessionSupport } = require('../../../src/cmap/connection');
const { Metrics } = require('../../../src/cmap/metrics');
const { expect } = require('chai');
const { Socket } = require('net');
const { ns } = require('../../../src/utils');
const { getSymbolFrom } = require('../../tools/utils');

describe('Connection - unit/cmap', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should support fire-and-forget messages', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }

      // blackhole all other requests
    });

    connect({ connectionType: Connection, hostAddress: server.hostAddress() }, (err, conn) => {
      expect(err).to.not.exist;
      expect(conn).to.exist;

      conn.command(ns('$admin.cmd'), { ping: 1 }, { noResponse: true }, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.not.exist;

        done();
      });
    });
  });

  it('should destroy streams which time out', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }

      // blackhole all other requests
    });

    connect({ connectionType: Connection, hostAddress: server.hostAddress() }, (err, conn) => {
      expect(err).to.not.exist;
      expect(conn).to.exist;

      conn.command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 }, (err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;

        expect(conn).property('stream').property('destroyed').to.be.true;

        done();
      });
    });
  });

  it('should throw a network error with kBeforeHandshake set to false on timeout after hand shake', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }
      // respond to no other requests to trigger timeout event
    });

    const options = {
      hostAddress: server.hostAddress()
    };

    connect(options, (err, conn) => {
      expect(err).to.be.a('undefined');
      expect(conn).to.be.instanceOf(Connection);
      expect(conn).to.have.property('ismaster').that.is.a('object');

      conn.command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 }, err => {
        const beforeHandshakeSymbol = getSymbolFrom(err, 'beforeHandshake', false);
        expect(beforeHandshakeSymbol).to.be.a('symbol');
        expect(err).to.have.property(beforeHandshakeSymbol, false);

        done();
      });
    });
  });

  describe('#markPinned', function () {
    let connection;
    const stream = new Socket();

    beforeEach(function () {
      connection = new Connection(stream, {
        hostAddress: server.hostAddress(),
        logicalSessionTimeoutMinutes: 5
      });
    });

    context('when the connection is not pinned', function () {
      beforeEach(function () {
        connection.markPinned(Metrics.TXN);
      });

      it('sets the connection as pinned', function () {
        expect(connection.pinType).to.equal(Metrics.TXN);
      });
    });

    context('when the connection is already pinned', function () {
      beforeEach(function () {
        connection.markPinned(Metrics.CURSOR);
        connection.markPinned(Metrics.TXN);
      });

      it('does not override the existing pin', function () {
        expect(connection.pinType).to.equal(Metrics.CURSOR);
      });
    });
  });

  describe('#markUnpinned', function () {
    let connection;
    const stream = new Socket();

    beforeEach(function () {
      connection = new Connection(stream, {
        hostAddress: server.hostAddress(),
        logicalSessionTimeoutMinutes: 5
      });
    });

    context('when the connection is pinned to the same type', function () {
      beforeEach(function () {
        connection.markPinned(Metrics.TXN);
        connection.markUnpinned(Metrics.TXN);
      });

      it('removes the connection pinning', function () {
        expect(connection.pinType).to.not.exist;
      });
    });

    context('when the connection is not pinned to the same type', function () {
      beforeEach(function () {
        connection.markPinned(Metrics.CURSOR);
        connection.markUnpinned(Metrics.TXN);
      });

      it('does not remove the existing pin', function () {
        expect(connection.pinType).to.equal(Metrics.CURSOR);
      });
    });
  });

  it('should throw a network error with kBeforeHandshake set to true on timeout before hand shake', function (done) {
    // respond to no requests to trigger timeout event
    server.setMessageHandler(() => {});

    const options = {
      hostAddress: server.hostAddress(),
      socketTimeoutMS: 50
    };

    connect(options, (err, conn) => {
      expect(conn).to.be.a('undefined');

      const beforeHandshakeSymbol = getSymbolFrom(err, 'beforeHandshake');
      expect(err).to.have.property(beforeHandshakeSymbol, true);

      done();
    });
  });

  describe('.hasSessionSupport', function () {
    let connection;
    const stream = new Socket();

    context('when logicalSessionTimeoutMinutes is preset', function () {
      beforeEach(function () {
        connection = new Connection(stream, {
          hostAddress: server.hostAddress(),
          logicalSessionTimeoutMinutes: 5
        });
      });

      it('returns true', function () {
        expect(hasSessionSupport(connection)).to.be.true;
      });
    });

    context('when logicalSessionTimeoutMinutes is not present', function () {
      context('when in load balancing mode', function () {
        beforeEach(function () {
          connection = new Connection(stream, {
            hostAddress: server.hostAddress(),
            loadBalanced: true
          });
        });

        it('returns true', function () {
          expect(hasSessionSupport(connection)).to.be.true;
        });
      });

      context('when not in load balancing mode', function () {
        beforeEach(function () {
          connection = new Connection(stream, {
            hostAddress: server.hostAddress()
          });
        });

        it('returns false', function () {
          expect(hasSessionSupport(connection)).to.be.false;
        });
      });
    });
  });
});
