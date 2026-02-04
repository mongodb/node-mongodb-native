import { expect } from 'chai';
import { existsSync } from 'fs';
import { resolve } from 'path';

import {
  AuthContext,
  compress,
  GSSAPI,
  HostAddress,
  MongoMissingDependencyError
} from '../../mongodb';
import { runtime } from '../../tools/utils';

function moduleExistsSync(moduleName) {
  return existsSync(resolve(__dirname, `../../../node_modules/${moduleName}`));
}

describe('optionalRequire', function () {
  describe('Snappy', function () {
    it('should error if not installed', async function () {
      const moduleName = 'snappy';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }

      const error = await compress(
        { zlibCompressionLevel: 0, agreedCompressor: 'snappy' },
        Buffer.alloc(1)
      ).then(
        () => null,
        e => e
      );

      expect(error).to.be.instanceOf(MongoMissingDependencyError);
    });
  });

  describe('Kerberos', function () {
    it('should error if not installed', async function () {
      const moduleName = 'kerberos';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }
      const gssapi = new GSSAPI();

      const error = await gssapi
        .auth(
          new AuthContext(null, true, {
            hostAddress: new HostAddress('a'),
            credentials: true,
            runtime
          })
        )
        .then(
          () => null,
          e => e
        );

      expect(error).to.be.instanceOf(MongoMissingDependencyError);
    });
  });
});
