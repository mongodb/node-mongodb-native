import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TokenCache } from '../../../../../src/cmap/auth/mongodb_oidc/token_cache';
import { Connection, MongoCredentials, TokenMachineWorkflow } from '../../../../mongodb';

describe('TokenMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new TokenMachineWorkflow(new TokenCache());

    context('when OIDC_TOKEN_FILE is not in the env', function () {
      let file;
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      before(function () {
        file = process.env.OIDC_TOKEN_FILE;
        delete process.env.OIDC_TOKEN_FILE;
      });

      after(function () {
        if (file) {
          process.env.OIDC_TOKEN_FILE = file;
        }
      });

      it('throws an error', async function () {
        const error = await workflow.execute(connection, credentials).catch(error => error);
        expect(error.message).to.include('OIDC_TOKEN_FILE');
      });
    });
  });
});
