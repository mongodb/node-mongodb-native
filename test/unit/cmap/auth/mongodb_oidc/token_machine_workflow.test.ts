import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, MongoCredentials, TokenMachineWorkflow } from '../../../../mongodb';

describe('TokenMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new TokenMachineWorkflow();

    context('when OIDC_TOKEN_FILE is not in the env', function () {
      let file;
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      before(function () {
        file = process.env.OIDC_TOKEN_FILE;
        delete process.env.OIDC_TOKEN_FILE;
      });

      after(function () {
        process.env.OIDC_TOKEN_FILE = file;
      });

      it('throws an error', async function () {
        try {
          await workflow.execute(connection, credentials);
          expect.fail('workflow must fail without OIDC_TOKEN_FILE');
        } catch (error) {
          expect(error.message).to.include('OIDC_TOKEN_FILE');
        }
      });
    });
  });
});
