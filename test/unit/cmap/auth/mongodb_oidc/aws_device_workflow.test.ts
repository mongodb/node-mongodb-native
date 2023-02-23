import { expect } from 'chai';
import * as sinon from 'sinon';

import { AwsDeviceWorkflow, Connection, MongoCredentials } from '../../../../mongodb';

describe('AwsDeviceWorkFlow', function () {
  describe('#execute', function () {
    const workflow = new AwsDeviceWorkflow();

    context('when AWS_WEB_IDENTITY_TOKEN_FILE is not in the env', function () {
      let file;
      const connection = sinon.createStubInstance(Connection);
      const credentials = sinon.createStubInstance(MongoCredentials);

      before(function () {
        file = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
        delete process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
      });

      after(function () {
        process.env.AWS_WEB_IDENTITY_TOKEN_FILE = file;
      });

      it('returns an error in the callback', function () {
        workflow.execute(connection, credentials, error => {
          expect(error.message).to.include('AWS_WEB_IDENTITY_TOKEN_FILE');
        });
      });
    });
  });
});
