import { expect } from 'chai';

describe('MONGODB-OIDC', function () {
  beforeEach(function () {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI || !MONGODB_URI.includes('MONGODB-OIDC')) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-OIDC auth mechanism';
      this.skip();
    }
  });

  context('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });
});
