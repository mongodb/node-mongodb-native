import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  MongoCredentials,
  TokenCache,
  TokenMachineWorkflow
} from '../../../../mongodb';

describe('TokenMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new TokenMachineWorkflow({ io: {} }, new TokenCache());

    context('when OIDC_TOKEN_FILE is not in the env', function () {
      let file;

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
        const connection = sinon.createStubInstance(Connection);
        const credentials = sinon.createStubInstance(MongoCredentials);
        connection.parent = { client: { io: {} } };
        const error = await workflow.execute(connection, credentials).catch(error => error);
        expect(error.message).to.include('OIDC_TOKEN_FILE');
      });
    });
  });
});
