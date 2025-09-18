import { expect } from 'chai';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { AuthContext } from '../../../src/cmap/auth/auth_provider';
import { GSSAPI } from '../../../src/cmap/auth/gssapi';
import { MongoDBAWS } from '../../../src/cmap/auth/mongodb_aws';
import { compress } from '../../../src/cmap/wire_protocol/compression';
import { MongoMissingDependencyError } from '../../../src/error';
import { HostAddress } from '../../../src/utils';

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
        .auth(new AuthContext(null, true, { hostAddress: new HostAddress('a'), credentials: true }))
        .then(
          () => null,
          e => e
        );

      expect(error).to.be.instanceOf(MongoMissingDependencyError);
    });
  });

  describe('aws4', function () {
    it('should error if not installed', async function () {
      const moduleName = 'aws4';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }
      const mdbAWS = new MongoDBAWS();

      const error = await mdbAWS
        .auth(new AuthContext({ hello: { maxWireVersion: 9 } }, true, null))
        .catch(error => error);

      expect(error).to.be.instanceOf(MongoMissingDependencyError);
    });
  });
});
