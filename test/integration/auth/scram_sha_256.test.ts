import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as deps from '../../../src/deps';
import { type MongoClient } from '../../mongodb';

describe('SCRAM_SHA_256', function () {
  beforeEach(function () {
    if (!this.configuration.parameters.authenticationMechanisms.includes('SCRAM-SHA-256')) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.currentTest!.skipReason = 'Test requires that SCRAM-SHA-256 be enabled on the server.';
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.currentTest!.skip();
    }
  });

  context('when saslprep is not a function', () => {
    let client: MongoClient;

    beforeEach(function () {
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

  context('when saslprep is a function', () => {
    let client: MongoClient;

    beforeEach(function () {
      client = this.configuration.newClient({ authMechanism: 'SCRAM-SHA-256' });
    });

    afterEach(() => client.close());

    it('calls saslprep', { requires: { auth: 'enabled' } }, async function () {
      const spy = sinon.spy(deps, 'saslprep');

      await client.connect();

      expect(spy.called).to.be.true;
    });
  });
});
