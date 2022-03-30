'use strict';

const mock = require('../../tools/mongodb-mock/index');
const { connect } = require('../../../src/cmap/connect');
const { Connection, hasSessionSupport } = require('../../../src/cmap/connection');
const { expect } = require('chai');
const { Socket } = require('net');
const { ns, isHello } = require('../../../src/utils');
const { getSymbolFrom } = require('../../tools/utils');
const sinon = require('sinon');
const { EventEmitter } = require('events');

describe('new Connection()', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should support fire-and-forget messages', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
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
      if (isHello(doc)) {
        request.reply(mock.HELLO);
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
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
      // respond to no other requests to trigger timeout event
    });

    const options = {
      hostAddress: server.hostAddress()
    };

    connect(options, (err, conn) => {
      expect(err).to.be.a('undefined');
      expect(conn).to.be.instanceOf(Connection);
      expect(conn).to.have.property('hello').that.is.a('object');

      conn.command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 }, err => {
        const beforeHandshakeSymbol = getSymbolFrom(err, 'beforeHandshake', false);
        expect(beforeHandshakeSymbol).to.be.a('symbol');
        expect(err).to.have.property(beforeHandshakeSymbol, false);

        done();
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

  describe('onTimeout()', () => {
    /** @type {import('../../../src/cmap/connection').Connection} */
    let connection;
    let clock;
    /** @type {FakeSocket} */
    let driverSocket;
    /** @type {MessageStream} */
    let messageStream;
    let kDelayedTimeoutId;
    let NodeJSTimeoutClass;

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      NodeJSTimeoutClass = setTimeout(() => null, 1).constructor;

      driverSocket = sinon.spy(
        new (class extends EventEmitter {
          address() {}
          pipe() {}
          destroy() {}
          get remoteAddress() {
            return 'iLoveJavaScript';
          }
          get remotePort() {
            return 123;
          }
        })()
      );
      connection = sinon.spy(new Connection(driverSocket, { id: 1 }));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      kDelayedTimeoutId = getSymbolFrom(connection, 'delayedTimeoutId');
      messageStream = connection[messageStreamSymbol];
    });

    afterEach(() => {
      clock.restore();
    });

    it('should delay timeout errors by one tick', async () => {
      driverSocket.emit('timeout');
      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);
      clock.tick(1);
      expect(driverSocket.destroy).to.have.been.calledOnce;
      expect(connection).to.have.property('closed', true);
      expect(connection).to.have.property(kDelayedTimeoutId, null);
    });

    it('should clear timeout errors if more data is available', () => {
      driverSocket.emit('timeout');
      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);
      messageStream.emit('message', Buffer.from('abc'));

      // New message before clock ticks 1 will clear the timeout
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      // ticking the clock should do nothing, there is no timeout anymore
      clock.tick(1);
      expect(driverSocket.destroy).to.not.have.been.calledOnce;
      expect(connection).to.have.property('closed', false);
    });
  });

  describe('.hasSessionSupport', function () {
    let connection;
    const stream = new Socket();

    context('when logicalSessionTimeoutMinutes is present', function () {
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
