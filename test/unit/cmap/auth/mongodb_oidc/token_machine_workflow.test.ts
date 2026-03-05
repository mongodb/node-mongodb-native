import { expect } from 'chai';
import * as process from 'process';

import { tokenMachineCallback } from '../../../../mongodb';

describe('Token machine workflow', function () {
  describe('#callback', function () {
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
        const error = await tokenMachineCallback().catch(error => error);
        expect(error.message).to.include('OIDC_TOKEN_FILE');
      });
    });
  });
});
