import { expect } from 'chai';
import type Sinon from 'sinon';
// eslint-disable-next-line no-duplicate-imports
import * as sinon from 'sinon';

import {
  Connection,
  LEGACY_HELLO_COMMAND,
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
      sinon.stub(Connection.prototype, 'command').callsFake(async function (ns, cmd, options) {
        // @ts-expect-error: sinon will place wrappedMethod there
        const command = Connection.prototype.command.wrappedMethod.bind(this);

        if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
          return command(ns, { ...cmd, client: { driver: { name: 'a'.repeat(1000) } } }, options);
        }
        return command(ns, cmd, options);
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
      client = this.configuration.newClient({}, { compressors: ['snappy'] });
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
    let opMsgRequestToBinSpy: Sinon.SinonSpy;

    beforeEach(() => {
      opMsgRequestToBinSpy = sinon.spy(OpMsgRequest.prototype, 'toBin');
    });

    afterEach(() => sinon.restore());

    it('sends the hello command as OP_MSG', {
      metadata: { requires: { topology: 'load-balanced' } },
      test: async function () {
        client = this.configuration.newClient({ loadBalanced: true });
        await client.db('admin').command({ ping: 1 });
        expect(opMsgRequestToBinSpy).to.have.been.called;
      }
    });
  });

  context('when serverApi version is present', function () {
    let opMsgRequestToBinSpy: Sinon.SinonSpy;

    beforeEach(() => {
      opMsgRequestToBinSpy = sinon.spy(OpMsgRequest.prototype, 'toBin');
    });

    afterEach(() => sinon.restore());

    it('sends the hello command as OP_MSG', {
      metadata: { requires: { topology: '!load-balanced', mongodb: '>=5.0' } },
      test: async function () {
        client = this.configuration.newClient({}, { serverApi: { version: ServerApiVersion.v1 } });
        await client.connect();
        expect(opMsgRequestToBinSpy).to.have.been.called;
      }
    });
  });

  context('when not load-balanced and serverApi version is not present', function () {
    let opQueryRequestToBinSpy: Sinon.SinonSpy;
    let opMsgRequestToBinSpy: Sinon.SinonSpy;

    beforeEach(() => {
      opQueryRequestToBinSpy = sinon.spy(OpQueryRequest.prototype, 'toBin');
      opMsgRequestToBinSpy = sinon.spy(OpMsgRequest.prototype, 'toBin');
    });

    afterEach(() => sinon.restore());

    it('sends the hello command as OP_MSG', {
      metadata: { requires: { topology: '!load-balanced', mongodb: '>=5.0' } },
      test: async function () {
        if (this.configuration.serverApi) {
          this.skipReason = 'Test requires serverApi to NOT be enabled';
          return this.skip();
        }
        client = this.configuration.newClient();
        await client.db('admin').command({ ping: 1 });
        expect(opQueryRequestToBinSpy).to.have.been.called;
        expect(opMsgRequestToBinSpy).to.have.been.called;
        opMsgRequestToBinSpy.calledAfter(opQueryRequestToBinSpy);
      }
    });
  });
});
