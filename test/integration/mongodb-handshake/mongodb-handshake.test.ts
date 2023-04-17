import { expect } from 'chai';
import Sinon, * as sinon from 'sinon';

import {
  Connection,
  LEGACY_HELLO_COMMAND,
  MongoServerError,
  MongoServerSelectionError
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
      expect(spy.called).to.be.true;
      const handshakeDoc = spy.getCall(0).args[1];
      expect(handshakeDoc).to.have.property('compression').to.deep.equal(['snappy']);
    });
  });
});
