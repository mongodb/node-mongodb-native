import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  connect,
  Connection,
  isHello,
  MongoClientAuthProviders,
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
});
