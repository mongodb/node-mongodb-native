import { expect } from 'chai';
import { EventEmitter, once } from 'events';
import { Socket } from 'net';
import * as sinon from 'sinon';
import { Readable } from 'stream';
import { setTimeout } from 'timers';
import { promisify } from 'util';

import {
  BinMsg,
  ClientMetadata,
  connect,
  Connection,
  hasSessionSupport,
  HostAddress,
  isHello,
  MessageStream,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoRuntimeError,
  ns,
  OperationDescription
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

/**
 * The absolute minimum socket API needed by these tests
 *
 * The driver has a greater API requirement for sockets detailed in: NODE-4785
 */
class FakeSocket extends EventEmitter {
  destroyed = false;
  writableEnded: boolean;
  timeout = 0;
  address() {
    // is never called
  }
  pipe() {
    // does not need to do anything
  }
  destroy() {
    // is called, has no side effects
    this.writableEnded = true;
    this.destroyed = true;
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
  setTimeout(timeout) {
    this.timeout = timeout;
  }
}

class InputStream extends Readable {
  writableEnded: boolean;
  timeout = 0;

  constructor(options?) {
    super(options);
  }

  end(cb) {
    this.writableEnded = true;
    if (typeof cb === 'function') {
      process.nextTick(cb);
    }
  }

  setTimeout(timeout) {
    this.timeout = timeout;
  }
}

describe('new Connection()', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('supports fire-and-forget messages', function (done) {
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

  it('destroys streams which time out', function (done) {
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

        expect(conn).property('stream').property('destroyed', true);

        done();
      });
    });
  });

  it('throws a network error with kBeforeHandshake set to false on timeout after handshake', function (done) {
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

  it('throws a network error with kBeforeHandshake set to true on timeout before handshake', function (done) {
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

    context('when sending commands on a connection', () => {
      const CONNECT_DEFAULTS = {
        id: 1,
        tls: false,
        generation: 1,
        monitorCommands: false,
        metadata: {} as ClientMetadata,
        loadBalanced: false
      };
      let server;
      let connectOptions;
      let connection: Connection;
      let streamSetTimeoutSpy;

      beforeEach(async () => {
        server = await mock.createServer();
        server.setMessageHandler(request => {
          if (isHello(request.document)) {
            request.reply(mock.HELLO);
          }
        });
        connectOptions = {
          ...CONNECT_DEFAULTS,
          hostAddress: server.hostAddress() as HostAddress,
          socketTimeoutMS: 15000
        };

        connection = await promisify<Connection>(callback =>
          //@ts-expect-error: Callbacks do not have mutual exclusion for error/result existence
          connect(connectOptions, callback)
        )();

        streamSetTimeoutSpy = sinon.spy(connection.stream, 'setTimeout');
      });

      afterEach(async () => {
        connection.destroy({ force: true });
        sinon.restore();
        await mock.cleanup();
      });

      it('sets timeout specified on class before writing to the socket', async () => {
        await promisify(callback =>
          connection.command(ns('admin.$cmd'), { hello: 1 }, {}, callback)
        )();
        expect(streamSetTimeoutSpy).to.have.been.calledWith(15000);
      });

      it('sets timeout specified on options before writing to the socket', async () => {
        await promisify(callback =>
          connection.command(ns('admin.$cmd'), { hello: 1 }, { socketTimeoutMS: 2000 }, callback)
        )();
        expect(streamSetTimeoutSpy).to.have.been.calledWith(2000);
      });

      it('clears timeout after getting a message if moreToCome=false', async () => {
        connection.stream.setTimeout(1);
        const msg = generateOpMsgBuffer({ hello: 1 });
        const msgHeader = {
          length: msg.readInt32LE(0),
          requestId: 1,
          responseTo: 0,
          opCode: msg.readInt32LE(12)
        };
        const msgBody = msg.subarray(16);
        msgBody.writeInt32LE(0, 0); // OPTS_MORE_TO_COME
        connection.onMessage(new BinMsg(msg, msgHeader, msgBody));
        // timeout is still reset
        expect(connection.stream).to.have.property('timeout', 0);
      });

      it('does not clear timeout after getting a message if moreToCome=true', async () => {
        connection.stream.setTimeout(1);
        const msg = generateOpMsgBuffer({ hello: 1 });
        const msgHeader = {
          length: msg.readInt32LE(0),
          requestId: 1,
          responseTo: 0,
          opCode: msg.readInt32LE(12)
        };
        const msgBody = msg.subarray(16);
        msgBody.writeInt32LE(2, 0); // OPTS_MORE_TO_COME
        connection[getSymbolFrom(connection, 'queue')].set(0, { cb: () => null });
        connection.onMessage(new BinMsg(msg, msgHeader, msgBody));
        // timeout is still set
        expect(connection.stream).to.have.property('timeout', 1);
      });
    });
  });

  describe('when the socket times out', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: FakeSocket;
    let messageStream: MessageStream;
    let callbackSpy;
    let closeCount = 0;
    let kDelayedTimeoutId;
    let NodeJSTimeoutClass: any;

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers({
        toFake: ['nextTick', 'setTimeout', 'clearTimeout']
      });
      driverSocket = new FakeSocket();
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = new Connection(driverSocket, connectionOptionsDefaults);
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = connection[messageStreamSymbol];

      callbackSpy = sinon.spy();
      // Create the operation description.
      const operationDescription: OperationDescription = {
        requestId: 1,
        cb: callbackSpy
      };

      connection.on('close', () => {
        closeCount++;
      });
      connection.once(Connection.PINNED, () => {
        /* no-op */
      });
      connection.once(Connection.UNPINNED, () => {
        /* no-op */
      });

      // Stick an operation description in the queue.
      const queueSymbol = getSymbolFrom(connection, 'queue');
      connection[queueSymbol].set(1, operationDescription);

      kDelayedTimeoutId = getSymbolFrom(connection, 'delayedTimeoutId');
      NodeJSTimeoutClass = setTimeout(() => null, 1).constructor;
    });

    afterEach(() => {
      closeCount = 0;
      sinon.restore();
      timerSandbox.restore();
      clock.restore();
    });

    context('delayed timeout for lambda behavior', () => {
      let cleanupSpy;
      let timeoutSpy;
      beforeEach(() => {
        cleanupSpy = sinon.spy(connection, 'cleanup');
        timeoutSpy = sinon.spy(connection, 'onTimeout');
      });

      it('delays timeout errors by one tick', async () => {
        expect(connection).to.have.property(kDelayedTimeoutId, null);

        driverSocket.emit('timeout');
        expect(cleanupSpy).to.not.have.been.called;
        expect(connection)
          .to.have.property(kDelayedTimeoutId)
          .that.is.instanceOf(NodeJSTimeoutClass);
        expect(connection).to.have.property('closed', false);

        clock.tick(1);

        expect(cleanupSpy).to.have.been.calledOnce;
        expect(connection).to.have.property('closed', true);
      });

      it('clears timeout errors if more data is available', () => {
        expect(connection).to.have.property(kDelayedTimeoutId, null);

        driverSocket.emit('timeout');
        expect(timeoutSpy).to.have.been.calledOnce;
        expect(cleanupSpy).not.to.have.been.called;
        expect(connection)
          .to.have.property(kDelayedTimeoutId)
          .that.is.instanceOf(NodeJSTimeoutClass);

        // emit a message before the clock ticks even once
        // onMessage ignores unknown 'responseTo' value
        messageStream.emit('message', { responseTo: null });

        // New message before clock ticks 1 will clear the timeout
        expect(connection).to.have.property(kDelayedTimeoutId, null);

        // ticking the clock should do nothing, there is no timeout anymore
        clock.tick(1);

        expect(cleanupSpy).not.to.have.been.called;
        expect(connection).to.have.property('closed', false);
        expect(connection).to.have.property(kDelayedTimeoutId, null);
      });
    });

    context('when the timeout expires and no more data has come in', () => {
      beforeEach(() => {
        driverSocket.emit('timeout');
        clock.tick(1);
      });

      it('destroys the MessageStream', () => {
        expect(messageStream.destroyed).to.be.true;
      });

      it('ends the socket', () => {
        expect(driverSocket.writableEnded).to.be.true;
      });

      it('destroys the socket after ending it', () => {
        expect(driverSocket.destroyed).to.be.true;
      });

      it('passes the error along to any callbacks in the operation description queue (asynchronously)', () => {
        expect(callbackSpy).to.have.been.calledOnce;
        const error = callbackSpy.firstCall.args[0];
        expect(error).to.be.instanceof(MongoNetworkTimeoutError);
      });

      it('emits a Connection.CLOSE event (asynchronously)', () => {
        expect(closeCount).to.equal(1);
      });

      it('does NOT remove all Connection.PINNED listeners', () => {
        expect(connection.listenerCount(Connection.PINNED)).to.equal(1);
      });

      it('does NOT remove all Connection.UNPINNED listeners', () => {
        expect(connection.listenerCount(Connection.UNPINNED)).to.equal(1);
      });

      it('removes all listeners on the MessageStream', () => {
        expect(messageStream.eventNames()).to.have.lengthOf(0);
      });

      it('removes all listeners on the socket', () => {
        expect(driverSocket.eventNames()).to.have.lengthOf(0);
      });
    });
  });

  describe('when the MessageStream errors', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: FakeSocket;
    let messageStream: MessageStream;
    let callbackSpy;
    const error = new Error('something went wrong');
    let closeCount = 0;

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers({
        toFake: ['nextTick']
      });
      driverSocket = new FakeSocket();
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = new Connection(driverSocket, connectionOptionsDefaults);
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = connection[messageStreamSymbol];

      callbackSpy = sinon.spy();
      // Create the operation description.
      const operationDescription: OperationDescription = {
        requestId: 1,
        cb: callbackSpy
      };

      connection.on('close', () => {
        closeCount++;
      });

      connection.once(Connection.PINNED, () => {
        /* no-op */
      });
      connection.once(Connection.UNPINNED, () => {
        /* no-op */
      });

      // Stick an operation description in the queue.
      const queueSymbol = getSymbolFrom(connection, 'queue');
      connection[queueSymbol].set(1, operationDescription);

      messageStream.emit('error', error);
    });

    afterEach(() => {
      closeCount = 0;
      sinon.restore();
      timerSandbox.restore();
      clock.restore();
    });

    it('destroys the MessageStream synchronously', () => {
      expect(messageStream.destroyed).to.be.true;
    });

    it('ends the socket', () => {
      expect(driverSocket.writableEnded).to.be.true;
    });

    it('destroys the socket after ending it (synchronously)', () => {
      expect(driverSocket.destroyed).to.be.true;
    });

    it('passes the error along to any callbacks in the operation description queue (synchronously)', () => {
      expect(callbackSpy).to.have.been.calledOnceWithExactly(error);
    });

    it('emits a Connection.CLOSE event (synchronously)', () => {
      expect(closeCount).to.equal(1);
    });

    it('does NOT remove all Connection.PINNED listeners', () => {
      expect(connection.listenerCount(Connection.PINNED)).to.equal(1);
    });

    it('does NOT remove all Connection.UNPINNED listeners', () => {
      expect(connection.listenerCount(Connection.UNPINNED)).to.equal(1);
    });

    it('removes all listeners on the MessageStream', () => {
      expect(messageStream.eventNames()).to.have.lengthOf(0);
    });

    it('removes all listeners on the socket', () => {
      expect(driverSocket.eventNames()).to.have.lengthOf(0);
    });
  });

  describe('when the underlying socket closes', () => {
    let connection: sinon.SinonSpiedInstance<Connection>;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonFakeTimers;
    let driverSocket: FakeSocket;
    let messageStream: MessageStream;
    let callbackSpy;
    let closeCount = 0;

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers({
        toFake: ['nextTick']
      });
      driverSocket = new FakeSocket();
      // @ts-expect-error: driverSocket does not fully satisfy the stream type, but that's okay
      connection = new Connection(driverSocket, connectionOptionsDefaults);
      const messageStreamSymbol = getSymbolFrom(connection, 'messageStream');
      messageStream = connection[messageStreamSymbol];

      callbackSpy = sinon.spy();
      // Create the operation description.
      const operationDescription: OperationDescription = {
        requestId: 1,
        cb: callbackSpy
      };

      connection.on('close', () => {
        closeCount++;
      });

      connection.once(Connection.PINNED, () => {
        /* no-op */
      });
      connection.once(Connection.UNPINNED, () => {
        /* no-op */
      });

      // Stick an operation description in the queue.
      const queueSymbol = getSymbolFrom(connection, 'queue');
      connection[queueSymbol].set(1, operationDescription);

      driverSocket.emit('close');
    });

    afterEach(() => {
      closeCount = 0;
      sinon.restore();
      timerSandbox.restore();
      clock.restore();
    });

    it('destroys the MessageStream synchronously', () => {
      expect(messageStream.destroyed).to.be.true;
    });

    it('ends the socket', () => {
      expect(driverSocket.writableEnded).to.be.true;
    });

    it('destroys the socket after ending it (synchronously)', () => {
      expect(driverSocket.destroyed).to.be.true;
    });

    it('calls any callbacks in the queue with a MongoNetworkError (synchronously)', () => {
      expect(callbackSpy).to.have.been.calledOnce;
      const error = callbackSpy.firstCall.args[0];
      expect(error).to.be.instanceof(MongoNetworkError);
    });

    it('emits a Connection.CLOSE event (synchronously)', () => {
      expect(closeCount).to.equal(1);
    });

    it('does NOT remove all Connection.PINNED listeners', () => {
      expect(connection.listenerCount(Connection.PINNED)).to.equal(1);
    });

    it('does NOT remove all Connection.UNPINNED listeners', () => {
      expect(connection.listenerCount(Connection.UNPINNED)).to.equal(1);
    });

    it('removes all listeners on the MessageStream', () => {
      expect(messageStream.eventNames()).to.have.lengthOf(0);
    });

    it('removes all listeners on the socket', () => {
      expect(driverSocket.eventNames()).to.have.lengthOf(0);
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
      beforeEach(function () {
        const options = {
          ...connectionOptionsDefaults,
          hostAddress: server.hostAddress()
        };
        connection = new Connection(stream, options);
      });

      it('returns false', function () {
        expect(hasSessionSupport(connection)).to.be.false;
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
      clock = sinon.useFakeTimers({
        toFake: ['nextTick']
      });

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

    it('removes all Connection.PINNED listeners', () => {
      connection.once(Connection.PINNED, () => {
        /* no-op */
      });
      connection.destroy({ force: true });
      expect(connection.listenerCount(Connection.PINNED)).to.equal(0);
    });

    it('removes all Connection.UNPINNED listeners', () => {
      connection.once(Connection.UNPINNED, () => {
        /* no-op */
      });
      connection.destroy({ force: true });
      expect(connection.listenerCount(Connection.UNPINNED)).to.equal(0);
    });

    context('when a callback is provided', () => {
      context('when the connection was already destroyed', () => {
        let callbackSpy;
        beforeEach(() => {
          connection.destroy({ force: true });
          connection.cleanup.resetHistory();
          callbackSpy = sinon.spy();
        });
        it('does not attempt to cleanup the socket again', () => {
          connection.destroy({ force: true }, callbackSpy);
          expect(connection.cleanup).not.to.have.been.called;
        });

        it('calls the callback (asynchronously)', () => {
          connection.destroy({ force: true }, callbackSpy);
          expect(callbackSpy).not.to.have.been.called;
          clock.runAll();
          expect(callbackSpy).to.have.been.called;
        });
      });

      context('when the connection was not destroyed', () => {
        let callbackSpy;
        beforeEach(() => {
          callbackSpy = sinon.spy();
        });
        it('cleans up the connection', () => {
          connection.destroy({ force: true }, callbackSpy);
          expect(connection.cleanup).to.have.been.called;
        });

        it('calls the callback (asynchronously)', () => {
          connection.destroy({ force: true }, callbackSpy);
          expect(callbackSpy).not.to.have.been.called;
          clock.runAll();
          expect(callbackSpy).to.have.been.called;
        });
      });
    });

    context('when options.force == true', function () {
      it('destroys the tcp socket (synchronously)', () => {
        expect(driverSocket.destroy).not.to.have.been.called;
        connection.destroy({ force: true });
        expect(driverSocket.destroy).to.have.been.calledOnce;
      });

      it('does not call stream.end', () => {
        connection.destroy({ force: true });
        expect(driverSocket.end).to.not.have.been.called;
      });

      it('destroys the messageStream (synchronously)', () => {
        connection.destroy({ force: true });
        expect(messageStream.destroy).to.have.been.calledOnce;
      });

      it('when destroy({ force: true }) is called multiple times, it calls stream.destroy exactly once', () => {
        connection.destroy({ force: true });
        connection.destroy({ force: true });
        connection.destroy({ force: true });
        expect(driverSocket.destroy).to.have.been.calledOnce;
      });
    });

    context('when options.force == false', function () {
      it('destroys the tcp socket (asynchronously)', () => {
        connection.destroy({ force: false });
        expect(driverSocket.destroy).not.to.have.been.called;
        clock.tick(1);
        expect(driverSocket.destroy).to.have.been.called;
      });

      it('ends the tcp socket (synchronously)', () => {
        connection.destroy({ force: false });
        expect(driverSocket.end).to.have.been.calledOnce;
      });

      it('destroys the messageStream (synchronously)', () => {
        connection.destroy({ force: false });
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
