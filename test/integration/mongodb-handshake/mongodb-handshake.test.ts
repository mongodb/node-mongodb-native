import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  LEGACY_HELLO_COMMAND,
  MongoServerError,
  MongoServerSelectionError
} from '../../mongodb';

describe('MongoDB Handshake', () => {
  let client;

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
});
