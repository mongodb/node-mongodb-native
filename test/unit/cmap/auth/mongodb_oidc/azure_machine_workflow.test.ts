import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  AzureMachineWorkflow,
  Connection,
  MongoCredentials,
  TokenCache
} from '../../../../mongodb';

describe('AzureMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new AzureMachineWorkflow({ io: {} }, new TokenCache());

    context('when TOKEN_RESOURCE is not set', function () {
      it('throws an error', async function () {
        const connection = sinon.createStubInstance(Connection);
        const credentials = sinon.createStubInstance(MongoCredentials);
        connection.parent = { client: { io: {} } };
        const error = await workflow.execute(connection, credentials).catch(error => error);
        expect(error.message, error.stack).to.include('TOKEN_RESOURCE');
      });
    });
  });
});
