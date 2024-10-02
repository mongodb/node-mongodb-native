import { Socket } from 'node:net';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { setTimeout } from 'timers/promises';

import {
  connect,
  Connection,
  isHello,
  MongoClientAuthProviders,
  MongoDBCollectionNamespace,
  MongoNetworkTimeoutError,
  ns
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { getSymbolFrom } from '../../tools/utils';

const connectionOptionsDefaults = {
  id: 0,
  generation: 0,
  monitorCommands: false,
  tls: false,
  metadata: undefined,
  loadBalanced: false
};

describe('new Connection()', function () {
  let server;

  after(() => mock.cleanup());

  before(() => mock.createServer().then(s => (server = s)));

  it('supports fire-and-forget messages', async function () {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }

      // black hole all other requests
    });

    const options = {
      ...connectionOptionsDefaults,
      connectionType: Connection,
      hostAddress: server.hostAddress(),
      authProviders: new MongoClientAuthProviders()
    };

    const conn = await connect(options);
    const readSpy = sinon.spy(conn, 'readMany');
    await conn.command(ns('$admin.cmd'), { ping: 1 }, { noResponse: true });
    expect(readSpy).to.not.have.been.called;
  });

  it('destroys streams which time out', async function () {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }

      // black hole all other requests
    });

    const options = {
      ...connectionOptionsDefaults,
      connectionType: Connection,
      hostAddress: server.hostAddress(),
      authProviders: new MongoClientAuthProviders()
    };

    const conn = await connect(options);
    const error = await conn
      .command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 })
      .catch(error => error);
    expect(error).to.be.instanceOf(MongoNetworkTimeoutError);
    expect(conn).property('socket').property('destroyed', true);
  });

  it('throws a network error with kBeforeHandshake set to false on timeout after handshake', async function () {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
      // respond to no other requests to trigger timeout event
    });

    const options = {
      hostAddress: server.hostAddress(),
      ...connectionOptionsDefaults,
      authProviders: new MongoClientAuthProviders()
    };

    const conn = await connect(options);

    const error = await conn
      .command(ns('$admin.cmd'), { ping: 1 }, { socketTimeoutMS: 50 })
      .catch(error => error);

    const beforeHandshakeSymbol = getSymbolFrom(error, 'beforeHandshake', false);
    expect(beforeHandshakeSymbol).to.be.a('symbol');
    expect(error).to.have.property(beforeHandshakeSymbol, false);
  });

  it('calls the command function through command', async function () {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
      request.reply({ ok: 1 });
    });

    const options = {
      ...connectionOptionsDefaults,
      hostAddress: server.hostAddress(),
      authProviders: new MongoClientAuthProviders()
    };

    const connection = await connect(options);
    const commandSpy = sinon.spy(connection, 'command');

    await connection.command(ns('dummy'), { ping: 1 }, {});
    expect(commandSpy).to.have.been.calledOnce;
  });

  it('throws a network error with kBeforeHandshake set to true on timeout before handshake', async function () {
    server.setMessageHandler(() => {
      // respond to no requests to trigger timeout event
    });

    const options = {
      ...connectionOptionsDefaults,
      hostAddress: server.hostAddress(),
      socketTimeoutMS: 50,
      authProviders: new MongoClientAuthProviders()
    };

    const error = await connect(options).catch(error => error);

    const beforeHandshakeSymbol = getSymbolFrom(error, 'beforeHandshake', false);
    expect(beforeHandshakeSymbol).to.be.a('symbol');
    expect(error).to.have.property(beforeHandshakeSymbol, true);
  });

  describe('NODE-6370: regression test', function () {
    class MockSocket extends Socket {
      override write(_data: string | Buffer) {
        return false;
      }
    }

    let socket: MockSocket;
    let connection: Connection;

    this.timeout(10_000);

    beforeEach(function () {
      socket = new MockSocket();
      connection = new Connection(socket, {});
    });

    const validResponse = Buffer.from(
      'a30000002a0800004b010000dd07000000000000008e000000016f6b00000000000000f03f0324636c757374657254696d65005800000011636c757374657254696d65001c00000093f6f266037369676e61747572650033000000056861736800140000000072d8d6eab4e0703d2d50846e2db7adb5d2733cc4126b65794964000200000026f6f2660000116f7065726174696f6e54696d65001c00000093f6f26600',
      'hex'
    );

    const chunks = [validResponse.slice(0, 10), validResponse.slice(10)];

    describe('when data is emitted before drain', function () {
      describe('first command', function () {
        describe('when there is no delay between data and drain', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );
            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);

            socket.emit('data', validResponse);
            socket.emit('drain');

            await result$;
          });
        });

        describe('when there is a delay between data and drain', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );

            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);
            socket.emit('data', validResponse);

            await setTimeout(10);

            socket.emit('drain');
            await result$;
          });
        });

        describe('when the data comes in multiple chunks', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );

            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);
            socket.emit('data', chunks[0]);

            await setTimeout(10);
            socket.emit('drain');

            socket.emit('data', chunks[1]);

            await result$;
          });
        });
      });

      describe('not first command', function () {
        beforeEach(async function () {
          const result$ = connection.command(
            MongoDBCollectionNamespace.fromString('foo.bar'),
            { ping: 1 },
            {}
          );

          // there is an await in writeCommand, we must move the event loop forward just enough
          // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
          // listeners are attached.
          await setTimeout(0);
          socket.emit('drain');
          socket.emit('data', validResponse);

          await result$;
        });

        describe('when there is no delay between data and drain', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );

            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);
            socket.emit('data', validResponse);

            // await setTimeout(0);
            // await setTimeout(10);
            socket.emit('drain');
            await result$;
          });
        });

        describe('when there is a delay between data and drain', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );

            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);
            socket.emit('data', validResponse);

            await setTimeout(10);
            // await setTimeout(10);
            socket.emit('drain');
            await result$;
          });
        });

        describe('when the data comes in multiple chunks', function () {
          it('does not hang', async function () {
            const result$ = connection.command(
              MongoDBCollectionNamespace.fromString('foo.bar'),
              { ping: 1 },
              {}
            );

            // there is an await in writeCommand, we must move the event loop forward just enough
            // so that we reach the `await drain`.  Otherwise, we'll emit both data and drain before
            // listeners are attached.
            await setTimeout(0);

            socket.emit('data', chunks[0]);

            await setTimeout(10);

            socket.emit('drain');

            socket.emit('data', chunks[1]);
            await result$;
          });
        });
      });
    });
  });
});
