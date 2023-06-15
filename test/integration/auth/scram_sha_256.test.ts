import { expect } from 'chai';
import * as sinon from 'sinon';

import { deps, type MongoClient } from '../../mongodb';

describe('SCRAM_SHA_256', function () {
  context('when saslprep is not a function', () => {
    let client: MongoClient;
    beforeEach(function () {
      if (!this.configuration.parameters.authenticationMechanisms.includes('SCRAM-SHA-256')) {
        this.currentTest!.skipReason = 'Test requires that SCRAM-SHA-256 be enabled on the server.';
        this.currentTest!.skip();
      }
    });

    beforeEach('setup mocks', function () {
      sinon.stub(deps, 'saslprep').value({});
      client = this.configuration.newClient({ authMechanism: 'SCRAM-SHA-256' });
    });

    afterEach(() => {
      sinon.restore();
      return client.close();
    });

    it('does not throw an error', { requires: { auth: 'enabled' } }, async function () {
      await client.connect();
    });

    it('emits a warning', { requires: { auth: 'enabled' } }, async function () {
      const warnings: Array<Error> = [];
      process.once('warning', w => warnings.push(w));
      await client.connect();
      expect(warnings).to.have.lengthOf(1);
      expect(warnings[0]).to.have.property(
        'message',
        'Warning: no saslprep library specified. Passwords will not be sanitized'
      );
    });
  });
});
