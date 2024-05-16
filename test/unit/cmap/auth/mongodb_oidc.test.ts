import { expect } from 'chai';

import {
  AuthContext,
  MongoCredentials,
  MongoDBOIDC,
  MongoInvalidArgumentError
} from '../../../mongodb';

describe('class MongoDBOIDC', () => {
  describe('when an unknown OIDC provider name is set', () => {
    it('prepare rejects with MongoInvalidArgumentError', async () => {
      const oidc = new MongoDBOIDC();
      const error = await oidc
        .prepare(
          {},
          new AuthContext(
            {},
            new MongoCredentials({
              mechanism: 'MONGODB-OIDC',
              mechanismProperties: { PROVIDER_NAME: 'iLoveJavaScript' }
            }),
            {}
          )
        )
        .catch(error => error);
      expect(error).to.be.instanceOf(MongoInvalidArgumentError);
      expect(error).to.match(/workflow for provider/);
    });

    it('auth rejects with MongoInvalidArgumentError', async () => {
      const oidc = new MongoDBOIDC();
      const error = await oidc
        .auth(
          new AuthContext(
            {},
            new MongoCredentials({
              mechanism: 'MONGODB-OIDC',
              mechanismProperties: { PROVIDER_NAME: 'iLoveJavaScript' }
            }),
            {}
          )
        )
        .catch(error => error);
      expect(error).to.be.instanceOf(MongoInvalidArgumentError);
      expect(error).to.match(/workflow for provider/);
    });
  });
});
