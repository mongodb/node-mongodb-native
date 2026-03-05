import { expect } from 'chai';

import { gcpCallback, OIDC_VERSION, type OIDCCallbackParams } from '../../../../mongodb';

describe('GCP machine workflow', function () {
  describe('#callback', function () {
    context('when TOKEN_RESOURCE is not set', function () {
      const controller = new AbortController();
      const params: OIDCCallbackParams = {
        timeoutContext: controller.signal,
        version: OIDC_VERSION
      };

      it('throws an error', async function () {
        const error = await gcpCallback(params).catch(error => error);
        expect(error.message).to.include('TOKEN_RESOURCE');
      });
    });
  });
});
