import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, GCPMachineWorkflow, MongoCredentials } from '../../../../mongodb';

describe('GCPMachineFlow', function () {
  describe('#execute', function () {
    const workflow = new GCPMachineWorkflow();

    context('when TOKEN_RESOURCE is not set', function () {
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      it('throws an error', async function () {
        try {
          await workflow.execute(connection, credentials);
          expect.fail('workflow must fail without TOKEN_RESOURCE');
        } catch (error) {
          expect(error.message).to.include('TOKEN_RESOURCE');
        }
      });
    });
  });
});
