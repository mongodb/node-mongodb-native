import { expect } from 'chai';

import { type AuthContext, AuthProvider, MongoRuntimeError } from '../../../mongodb';

describe('AuthProvider', function () {
  describe('#reauth', function () {
    context('when the provider is already reauthenticating', function () {
      const provider = new (class extends AuthProvider {
        override auth(_context: AuthContext): Promise<void> {
          throw new Error('Method not implemented.');
        }
      })();

      const context = { reauthenticating: true };

      it('returns an error', async function () {
        const error = await provider.reauth(context).then(
          () => null,
          error => error
        );
        expect(error).to.exist;
        expect(error).to.be.instanceOf(MongoRuntimeError);
        expect(error?.message).to.equal('Reauthentication already in progress.');
      });
    });
  });
});
