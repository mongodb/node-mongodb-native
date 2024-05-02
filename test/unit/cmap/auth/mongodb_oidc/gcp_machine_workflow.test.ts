import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, GCPMachineWorkflow, MongoCredentials, TokenCache } from '../../../../mongodb';

describe('GCPMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new GCPMachineWorkflow(new TokenCache());

    context('when TOKEN_RESOURCE is not set', function () {
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      it('throws an error', async function () {
        const error = await workflow.execute(connection, credentials).catch(error => error);
        expect(error.message).to.include('TOKEN_RESOURCE');
      });
    });
  });
});
