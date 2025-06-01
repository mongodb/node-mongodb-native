import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/token_machine_workflow';

describe('TokenMachineFlow', function () {
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
        const error = await callback().catch(error => error);
        expect(error.message).to.include('OIDC_TOKEN_FILE');
      });
    });
  });
});
