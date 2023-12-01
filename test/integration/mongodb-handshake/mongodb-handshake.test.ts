import { expect } from 'chai';
import type Sinon from 'sinon';
import * as sinon from 'sinon';

import {
  Connection,
  LEGACY_HELLO_COMMAND,
  MessageStream,
  MongoServerError,
  MongoServerSelectionError,
  OpMsgRequest,
  OpQueryRequest,
  ServerApiVersion
} from '../../mongodb';

describe('MongoDB Handshake', () => {
  let client;

  afterEach(() => client.close());

  context('when hello is too large', () => {
    before(() => {
      sinon.stub(Connection.prototype, 'command').callsFake(function (ns, cmd, options, callback) {
        // @ts-expect-error: sinon will place wrappedMethod there
        const command = Connection.prototype.command.wrappedMethod.bind(this);

        if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
          return command(
            ns,
            { ...cmd, client: { driver: { name: 'a'.repeat(1000) } } },
            options,
            callback
          );
        }
        return command(ns, cmd, options, callback);
      });
    });

    after(() => sinon.restore());

    it('should fail with an error relating to size', async function () {
      client = this.configuration.newClient({ serverSelectionTimeoutMS: 2000 });
      const error = await client.connect().catch(error => error);
      if (this.configuration.isLoadBalanced) {
        expect(error).to.be.instanceOf(MongoServerError);
      } else {
        expect(error).to.be.instanceOf(MongoServerSelectionError);
      }
      expect(error).to.match(/client metadata document must be less/);
    });
  });

  context('when compressors are provided on the mongo client', () => {
    let spy: Sinon.SinonSpy;

    before(() => {
      spy = sinon.spy(Connection.prototype, 'command');
    });

    after(() => sinon.restore());

    it('constructs a handshake with the specified compressors', async function () {
      client = this.configuration.newClient({ compressors: ['snappy'] });
      await client.connect();
      // The load-balanced mode doesn’t perform SDAM,
      // so `connect` doesn’t do anything unless authentication is enabled.
      // Force the driver to send a command to the server in the noauth mode.
      await client.db('admin').command({ ping: 1 });
      expect(spy.called).to.be.true;
      const handshakeDoc = spy.getCall(0).args[1];
      expect(handshakeDoc).to.have.property('compression').to.deep.equal(['snappy']);
    });
  });

  context('when load-balanced', function () {
    let writeCommandSpy: Sinon.SinonSpy;

    beforeEach(() => {
      writeCommandSpy = sinon.spy(MessageStream.prototype, 'writeCommand');
    });

    afterEach(() => sinon.restore());

    it('should send the hello command as OP_MSG', {
      metadata: { requires: { topology: 'load-balanced' } },
      test: async function () {
        client = this.configuration.newClient({ loadBalanced: true });
        await client.connect();
        // The load-balanced mode doesn’t perform SDAM,
        // so `connect` doesn’t do anything unless authentication is enabled.
        // Force the driver to send a command to the server in the noauth mode.
        await client.db('admin').command({ ping: 1 });
        expect(writeCommandSpy).to.have.been.called;
        expect(writeCommandSpy.firstCall.args[0] instanceof OpMsgRequest).to.equal(true);
      }
    });
  });

  context('when serverApi version is present', function () {
    let writeCommandSpy: Sinon.SinonSpy;

    beforeEach(() => {
      writeCommandSpy = sinon.spy(MessageStream.prototype, 'writeCommand');
    });

    afterEach(() => sinon.restore());

    it('should send the hello command as OP_MSG', {
      metadata: { requires: { topology: '!load-balanced', mongodb: '>=5.0' } },
      test: async function () {
        client = this.configuration.newClient({}, { serverApi: { version: ServerApiVersion.v1 } });
        await client.connect();
        // The load-balanced mode doesn’t perform SDAM,
        // so `connect` doesn’t do anything unless authentication is enabled.
        // Force the driver to send a command to the server in the noauth mode.
        await client.db('admin').command({ ping: 1 });
        expect(writeCommandSpy).to.have.been.called;
        expect(writeCommandSpy.firstCall.args[0] instanceof OpMsgRequest).to.equal(true);
      }
    });
  });

  context('when not load-balanced and serverApi version is not present', function () {
    let writeCommandSpy: Sinon.SinonSpy;

    beforeEach(() => {
      writeCommandSpy = sinon.spy(MessageStream.prototype, 'writeCommand');
    });

    afterEach(() => sinon.restore());

    it('should send the hello command as OP_MSG', {
      metadata: { requires: { topology: '!load-balanced', mongodb: '>=5.0' } },
      test: async function () {
        client = this.configuration.newClient({}, { serverApi: null });
        await client.connect();
        // The load-balanced mode doesn’t perform SDAM,
        // so `connect` doesn’t do anything unless authentication is enabled.
        // Force the driver to send a command to the server in the noauth mode.
        await client.db('admin').command({ ping: 1 });
        expect(writeCommandSpy).to.have.been.called;

        const opRequests = writeCommandSpy.getCalls().map(items => items.args[0]);
        expect(opRequests[0] instanceof OpQueryRequest).to.equal(true);
        const isOpMsgRequestSent = !!opRequests.find(op => op instanceof OpMsgRequest);
        expect(isOpMsgRequestSent).to.equal(true);
      }
    });
  });
});
