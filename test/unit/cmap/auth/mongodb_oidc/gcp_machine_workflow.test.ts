import { expect } from 'chai';

import { OIDC_VERSION, type OIDCCallbackParams } from '../../../../../src/cmap/auth/mongodb_oidc';
import { callback } from '../../../../../src/cmap/auth/mongodb_oidc/gcp_machine_workflow';

describe('GCP machine workflow', function () {
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
