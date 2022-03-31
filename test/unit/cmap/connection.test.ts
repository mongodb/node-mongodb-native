import { expect } from 'chai';
import { EventEmitter } from 'events';
import { Socket } from 'net';
import * as sinon from 'sinon';

import { connect } from '../../../src/cmap/connect';
import { Connection, hasSessionSupport } from '../../../src/cmap/connection';
import { MessageStream } from '../../../src/cmap/message_stream';
import { isHello, ns } from '../../../src/utils';
import * as mock from '../../tools/mongodb-mock/index';
import { getSymbolFrom } from '../../tools/utils';

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

    // @ts-expect-error: This subset of options is all that is needed
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

    // @ts-expect-error: This subset of options is all that is needed
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

    // @ts-expect-error: This subset of options is all that is needed
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
    server.setMessageHandler(() => {
      // respond to no requests to trigger timeout event
    });

    const options = {
      hostAddress: server.hostAddress(),
      socketTimeoutMS: 50
    };

    // @ts-expect-error: This subset of options is all that is needed
    connect(options, (err, conn) => {
      expect(conn).to.be.a('undefined');

      const beforeHandshakeSymbol = getSymbolFrom(err, 'beforeHandshake');
      expect(err).to.have.property(beforeHandshakeSymbol, true);

      done();
    });
  });

  describe('onTimeout()', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let driverSocket: sinon.SinonSpiedInstance<FakeSocket>;
    let messageStream: MessageStream;
    let kDelayedTimeoutId: symbol;
    let NodeJSTimeoutClass: any;

    /** The absolute minimum socket API needed by Connection as of writing this test */
    class FakeSocket extends EventEmitter {
      address() {
        // is never called
      }
      pipe() {
        // does not need to do anything
      }
      destroy() {
        // is called, has no side effects
      }
      get remoteAddress() {
        return 'iLoveJavaScript';
      }
      get remotePort() {
        return 123;
      }
    }

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      NodeJSTimeoutClass = setTimeout(() => null, 1).constructor;

      driverSocket = sinon.spy(new FakeSocket());
      // @ts-expect-error: This subset of options is all that is needed
      connection = sinon.spy(new Connection(driverSocket, { id: 1 }));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      kDelayedTimeoutId = getSymbolFrom(connection, 'delayedTimeoutId');
      messageStream = connection[messageStreamSymbol];
    });

    afterEach(() => {
      clock.restore();
    });

    it('should delay timeout errors by one tick', async () => {
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      driverSocket.emit('timeout');
      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);

      clock.tick(1);

      expect(driverSocket.destroy).to.have.been.calledOnce;
      expect(connection).to.have.property('closed', true);
      // timeout callback should clear it's own reference
      expect(connection).to.have.property(kDelayedTimeoutId, null);
    });

    it('should clear timeout errors if more data is available', () => {
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      driverSocket.emit('timeout');
      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);

      // emit a message before the clock ticks even once
      // onMessage ignores unknown 'responseTo' value
      messageStream.emit('message', { responseTo: null });

      // New message before clock ticks 1 will clear the timeout
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      // ticking the clock should do nothing, there is no timeout anymore
      clock.tick(1);

      expect(driverSocket.destroy).to.not.have.been.calledOnce;
      expect(connection).to.have.property('closed', false);
      expect(connection).to.have.property(kDelayedTimeoutId, null);
    });
  });

  describe('.hasSessionSupport', function () {
    let connection;
    const stream = new Socket();

    context('when logicalSessionTimeoutMinutes is present', function () {
      beforeEach(function () {
        // @ts-expect-error: This subset of options is all that is needed
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
          // @ts-expect-error: This subset of options is all that is needed
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
          // @ts-expect-error: This subset of options is all that is needed
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
