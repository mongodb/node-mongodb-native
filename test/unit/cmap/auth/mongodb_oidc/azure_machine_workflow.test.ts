import { expect } from 'chai';

import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/azure_machine_workflow';
import { OIDC_VERSION, type OIDCCallbackParams } from '../../../../mongodb';

describe('Azure machine workflow', function () {
  describe('#callback', function () {
    context('when TOKEN_RESOURCE is not set', function () {
      const controller = new AbortController();
      const params: OIDCCallbackParams = {
        timeoutContext: controller.signal,
        version: OIDC_VERSION
      };

      it('throws an error', async function () {
        const error = await callback(params).catch(error => error);
        expect(error.message).to.include('TOKEN_RESOURCE');
      });
    });
  });
});
