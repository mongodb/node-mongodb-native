import { expect } from 'chai';
import { EventEmitter, once } from 'events';
import { Socket } from 'net';
import * as sinon from 'sinon';
import { Readable } from 'stream';
import { setTimeout } from 'timers';

import {
  BinMsg,
  connect,
  Connection,
  hasSessionSupport,
  isHello,
  MessageStream,
  MongoNetworkTimeoutError,
  MongoRuntimeError,
  ns
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { generateOpMsgBuffer, getSymbolFrom } from '../../tools/utils';
import { createTimerSandbox } from '../timer_sandbox';

const connectionOptionsDefaults = {
  id: 0,
  generation: 0,
  monitorCommands: false,
  tls: false,
  metadata: undefined,
  loadBalanced: false
};

/** The absolute minimum socket API needed by Connection as of writing this test */
class FakeSocket extends EventEmitter {
  writableEnded: boolean;
  address() {
    // is never called
  }
  pipe() {
    // does not need to do anything
  }
  destroy() {
    // is called, has no side effects
    this.writableEnded = true;
  }
  end(cb) {
    this.writableEnded = true;
    // nextTick to simulate I/O delay
    if (typeof cb === 'function') {
      process.nextTick(cb);
    }
  }
  get remoteAddress() {
    return 'iLoveJavaScript';
  }
  get remotePort() {
    return 123;
  }
}

class InputStream extends Readable {
  writableEnded: boolean;
  constructor(options?) {
    super(options);
  }

  end(cb) {
    this.writableEnded = true;
    if (typeof cb === 'function') {
      process.nextTick(cb);
    }
  }
}

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

    const options = {
      ...connectionOptionsDefaults,
      connectionType: Connection,
      hostAddress: server.hostAddress()
    };

    connect(options, (err, conn) => {
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

    const options = {
      ...connectionOptionsDefaults,
      connectionType: Connection,
      hostAddress: server.hostAddress()
    };

    connect(options, (err, conn) => {
      expect(err).to.not.exist;
      expect(conn).to.exist;

      conn.command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 }, (err, result) => {
        expect(err).to.be.instanceOf(MongoNetworkTimeoutError);
        expect(result).to.not.exist;

        expect(conn).property('stream').property('writableEnded', true);

        done();
      });
    });
  });

  it('should throw a network error with kBeforeHandshake set to false on timeout after handshake', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
      // respond to no other requests to trigger timeout event
    });

    const options = {
      hostAddress: server.hostAddress(),
      ...connectionOptionsDefaults
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

  it('should throw a network error with kBeforeHandshake set to true on timeout before handshake', function (done) {
    server.setMessageHandler(() => {
      // respond to no requests to trigger timeout event
    });

    const options = {
      ...connectionOptionsDefaults,
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

  describe('#onMessage', function () {
    context('when the connection is a monitoring connection', function () {
      let queue: Map<number, OperationDescription>;
      let driverSocket: FakeSocket;
      let connection: Connection;

      beforeEach(function () {
        driverSocket = sinon.spy(new FakeSocket());
      });

      context('when multiple hellos exist on the stream', function () {
        let callbackSpy;
        const inputStream = new InputStream();
        const document = { ok: 1 };
        const last = { isWritablePrimary: true };

        beforeEach(function () {
          callbackSpy = sinon.spy();
          const firstHello = generateOpMsgBuffer(document);
          const secondHello = generateOpMsgBuffer(document);
          const thirdHello = generateOpMsgBuffer(last);
          const buffer = Buffer.concat([firstHello, secondHello, thirdHello]);

          connection = sinon.spy(new Connection(inputStream, connectionOptionsDefaults));
          connection.isMonitoringConnection = true;
          const queueSymbol = getSymbolFrom(connection, 'queue');
          queue = connection[queueSymbol];

          // Create the operation description.
          const operationDescription: OperationDescription = {
            requestId: 1,
            cb: callbackSpy
          };

          // Stick an operation description in the queue.
          queue.set(1, operationDescription);

          // Push the buffer of 3 hellos to the input stream
          inputStream.push(buffer);
          inputStream.push(null);
        });

        it('calls the callback with the last hello document', async function () {
          const messages = await once(connection, 'message');
          expect(messages[0].responseTo).to.equal(0);
          expect(callbackSpy).to.be.calledOnceWith(undefined, last);
        });
      });

      context('when requestId/responseTo do not match', function () {
        let callbackSpy;
        const document = { ok: 1 };

        beforeEach(function () {
          callbackSpy = sinon.spy();

          // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
          connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
          connection.isMonitoringConnection = true;
          const queueSymbol = getSymbolFrom(connection, 'queue');
          queue = connection[queueSymbol];

          // Create the operation description.
          const operationDescription: OperationDescription = {
            requestId: 1,
            cb: callbackSpy
          };

          // Stick an operation description in the queue.
          queue.set(1, operationDescription);
          // Emit a message that won't match the existing operation description.
          const msg = generateOpMsgBuffer(document);
          const msgHeader: MessageHeader = {
            length: msg.readInt32LE(0),
            requestId: 1,
            responseTo: 0, // This will not match.
            opCode: msg.readInt32LE(12)
          };
          const msgBody = msg.subarray(16);

          const message = new BinMsg(msg, msgHeader, msgBody);
          connection.onMessage(message);
        });

        it('calls the operation description callback with the document', function () {
          expect(callbackSpy).to.be.calledOnceWith(undefined, document);
        });
      });

      context('when requestId/reponseTo match', function () {
        let callbackSpy;
        const document = { ok: 1 };

        beforeEach(function () {
          callbackSpy = sinon.spy();

          // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
          connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
          connection.isMonitoringConnection = true;
          const queueSymbol = getSymbolFrom(connection, 'queue');
          queue = connection[queueSymbol];

          // Create the operation description.
          const operationDescription: OperationDescription = {
            requestId: 1,
            cb: callbackSpy
          };

          // Stick an operation description in the queue.
          queue.set(1, operationDescription);
          // Emit a message that matches the existing operation description.
          const msg = generateOpMsgBuffer(document);
          const msgHeader: MessageHeader = {
            length: msg.readInt32LE(0),
            requestId: 2,
            responseTo: 1,
            opCode: msg.readInt32LE(12)
          };
          const msgBody = msg.subarray(16);

          const message = new BinMsg(msg, msgHeader, msgBody);
          connection.onMessage(message);
        });

        it('calls the operation description callback with the document', function () {
          expect(callbackSpy).to.be.calledOnceWith(undefined, document);
        });
      });

      context('when no operation description is in the queue', function () {
        const document = { ok: 1 };

        beforeEach(function () {
          // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
          connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
          connection.isMonitoringConnection = true;
          const queueSymbol = getSymbolFrom(connection, 'queue');
          queue = connection[queueSymbol];
        });

        it('does not error', function () {
          const msg = generateOpMsgBuffer(document);
          const msgHeader: MessageHeader = {
            length: msg.readInt32LE(0),
            requestId: 2,
            responseTo: 1,
            opCode: msg.readInt32LE(12)
          };
          const msgBody = msg.subarray(16);

          const message = new BinMsg(msg, msgHeader, msgBody);
          expect(() => {
            connection.onMessage(message);
          }).to.not.throw();
        });
      });

      context('when more than one operation description is in the queue', function () {
        let spyOne;
        let spyTwo;
        const document = { ok: 1 };

        beforeEach(function () {
          spyOne = sinon.spy();
          spyTwo = sinon.spy();

          // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
          connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
          connection.isMonitoringConnection = true;
          const queueSymbol = getSymbolFrom(connection, 'queue');
          queue = connection[queueSymbol];

          // Create the operation descriptions.
          const descriptionOne: OperationDescription = {
            requestId: 1,
            cb: spyOne
          };
          const descriptionTwo: OperationDescription = {
            requestId: 2,
            cb: spyTwo
          };

          // Stick an operation description in the queue.
          queue.set(2, descriptionOne);
          queue.set(3, descriptionTwo);
          // Emit a message that matches the existing operation description.
          const msg = generateOpMsgBuffer(document);
          const msgHeader: MessageHeader = {
            length: msg.readInt32LE(0),
            requestId: 2,
            responseTo: 1,
            opCode: msg.readInt32LE(12)
          };
          const msgBody = msg.subarray(16);

          const message = new BinMsg(msg, msgHeader, msgBody);
          connection.onMessage(message);
        });

        it('calls all operation description callbacks with an error', function () {
          expect(spyOne).to.be.calledOnce;
          expect(spyTwo).to.be.calledOnce;
          const errorOne = spyOne.firstCall.args[0];
          const errorTwo = spyTwo.firstCall.args[0];
          expect(errorOne).to.be.instanceof(MongoRuntimeError);
          expect(errorTwo).to.be.instanceof(MongoRuntimeError);
        });
      });
    });
  });

  describe('onTimeout()', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: sinon.SinonSpiedInstance<FakeSocket>;
    let messageStream: MessageStream;
    let kDelayedTimeoutId: symbol;
    let NodeJSTimeoutClass: any;

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();

      NodeJSTimeoutClass = setTimeout(() => null, 1).constructor;

      driverSocket = sinon.spy(new FakeSocket());
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      kDelayedTimeoutId = getSymbolFrom(connection, 'delayedTimeoutId');
      messageStream = sinon.spy(connection[messageStreamSymbol]);
    });

    afterEach(() => {
      timerSandbox.restore();
      clock.restore();
    });

    it('should delay timeout errors by one tick', async () => {
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      driverSocket.emit('timeout');
      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection.destroy).to.not.have.been.called;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);
      expect(connection).to.have.property('closed', false);
      expect(driverSocket.end).to.not.have.been.called;

      clock.tick(1);

      expect(driverSocket.end).to.have.been.calledOnce;
      expect(connection.destroy).to.have.been.calledOnce;
      expect(connection).to.have.property('closed', true);
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

      expect(driverSocket.destroy).to.not.have.been.called;
      expect(connection).to.have.property('closed', false);
      expect(connection).to.have.property(kDelayedTimeoutId, null);
    });

    it('destroys the message stream and socket', () => {
      expect(connection).to.have.property(kDelayedTimeoutId, null);

      driverSocket.emit('timeout');

      clock.tick(1);

      expect(connection.onTimeout).to.have.been.calledOnce;
      expect(connection).to.have.property(kDelayedTimeoutId).that.is.instanceOf(NodeJSTimeoutClass);

      expect(messageStream.destroy).to.have.been.calledOnce;
      expect(driverSocket.destroy).to.not.have.been.called;
      expect(driverSocket.end).to.have.been.calledOnce;
    });
  });

  describe('onError()', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: sinon.SinonSpiedInstance<FakeSocket>;
    let messageStream: MessageStream;
    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
      driverSocket = sinon.spy(new FakeSocket());
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = sinon.spy(connection[messageStreamSymbol]);
    });

    afterEach(() => {
      timerSandbox.restore();
      clock.restore();
    });

    it('destroys the message stream and socket', () => {
      messageStream.emit('error');
      clock.tick(1);
      expect(connection.onError).to.have.been.calledOnce;
      connection.destroy({ force: false });
      clock.tick(1);
      expect(messageStream.destroy).to.have.been.called;
      expect(driverSocket.destroy).to.not.have.been.called;
      expect(driverSocket.end).to.have.been.calledOnce;
    });
  });

  describe('onClose()', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: sinon.SinonSpiedInstance<FakeSocket>;
    let messageStream: MessageStream;
    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();

      driverSocket = sinon.spy(new FakeSocket());
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = sinon.spy(connection[messageStreamSymbol]);
    });

    afterEach(() => {
      timerSandbox.restore();
      clock.restore();
    });

    it('destroys the message stream and socket', () => {
      driverSocket.emit('close');
      clock.tick(1);
      expect(connection.onClose).to.have.been.calledOnce;
      connection.destroy({ force: false });
      clock.tick(1);
      expect(messageStream.destroy).to.have.been.called;
      expect(driverSocket.destroy).to.not.have.been.called;
      expect(driverSocket.end).to.have.been.calledOnce;
    });
  });

  describe('.hasSessionSupport', function () {
    let connection;
    const stream = new Socket();

    context('when logicalSessionTimeoutMinutes is present', function () {
      beforeEach(function () {
        const options = {
          ...connectionOptionsDefaults,
          hostAddress: server.hostAddress(),
          logicalSessionTimeoutMinutes: 5
        };
        connection = new Connection(stream, options);
      });

      it('returns true', function () {
        expect(hasSessionSupport(connection)).to.be.true;
      });
    });

    context('when logicalSessionTimeoutMinutes is not present', function () {
      context('when in load balancing mode', function () {
        beforeEach(function () {
          const options = {
            ...connectionOptionsDefaults,
            hostAddress: server.hostAddress(),
            loadBalanced: true
          };
          connection = new Connection(stream, options);
        });

        it('returns true', function () {
          expect(hasSessionSupport(connection)).to.be.true;
        });
      });

      context('when not in load balancing mode', function () {
        beforeEach(function () {
          const options = {
            ...connectionOptionsDefaults,
            hostAddress: server.hostAddress(),
            loadBalanced: false
          };
          connection = new Connection(stream, options);
        });

        it('returns false', function () {
          expect(hasSessionSupport(connection)).to.be.false;
        });
      });
    });
  });

  describe('destroy()', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: sinon.SinonSpiedInstance<FakeSocket>;
    let messageStream: MessageStream;
    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();

      driverSocket = sinon.spy(new FakeSocket());
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = sinon.spy(new Connection(driverSocket, connectionOptionsDefaults));
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = sinon.spy(connection[messageStreamSymbol]);
    });

    afterEach(() => {
      timerSandbox.restore();
      clock.restore();
    });

    context('when options.force == true', function () {
      it('calls stream.destroy', () => {
        connection.destroy({ force: true });
        clock.tick(1);
        expect(driverSocket.destroy).to.have.been.calledOnce;
      });

      it('does not call stream.end', () => {
        connection.destroy({ force: true });
        clock.tick(1);
        expect(driverSocket.end).to.not.have.been.called;
      });

      it('destroys the tcp socket', () => {
        connection.destroy({ force: true });
        clock.tick(1);
        expect(driverSocket.destroy).to.have.been.calledOnce;
      });

      it('destroys the messageStream', () => {
        connection.destroy({ force: true });
        clock.tick(1);
        expect(messageStream.destroy).to.have.been.calledOnce;
      });

      it('calls stream.destroy whenever destroy is called ', () => {
        connection.destroy({ force: true });
        connection.destroy({ force: true });
        connection.destroy({ force: true });
        clock.tick(1);
        expect(driverSocket.destroy).to.have.been.calledThrice;
      });
    });

    context('when options.force == false', function () {
      it('calls stream.end', () => {
        connection.destroy({ force: false });
        clock.tick(1);
        expect(driverSocket.end).to.have.been.calledOnce;
      });

      it('does not call stream.destroy', () => {
        connection.destroy({ force: false });
        clock.tick(1);
        expect(driverSocket.destroy).to.not.have.been.called;
      });

      it('ends the tcp socket', () => {
        connection.destroy({ force: false });
        clock.tick(1);
        expect(driverSocket.end).to.have.been.calledOnce;
      });

      it('destroys the messageStream', () => {
        connection.destroy({ force: false });
        clock.tick(1);
        expect(messageStream.destroy).to.have.been.calledOnce;
      });

      it('calls stream.end exactly once when destroy is called multiple times', () => {
        connection.destroy({ force: false });
        connection.destroy({ force: false });
        connection.destroy({ force: false });
        connection.destroy({ force: false });
        clock.tick(1);
        expect(driverSocket.end).to.have.been.calledOnce;
      });
    });
  });
});
