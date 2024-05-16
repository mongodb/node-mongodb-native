import { expect } from 'chai';

import { AuthProvider, MongoRuntimeError } from '../../../mongodb';

describe('AuthProvider', function () {
  describe('#reauth', function () {
    describe('when the provider is already reauthenticating', function () {
      const provider = new AuthProvider();
      const context = { reauthenticating: true };

      it('returns an error', function () {
        provider.reauth(context, error => {
          expect(error).to.exist;
          expect(error).to.be.instanceOf(MongoRuntimeError);
          expect(error?.message).to.equal('Reauthentication already in progress.');
        });
      });
    });
  });
});
