import { expect } from 'chai';
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as zlib from 'zlib';

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
  describe('Zstandard', function () {
    it('supports built-in zstd when the addon is not installed', async function () {
      const moduleName = '@mongodb-js/zstd';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }

      const error = await compress(
        { zlibCompressionLevel: 0, agreedCompressor: 'zstd' },
        Buffer.from('test', 'utf8')
      ).then(
        () => null,
        e => e
      );

      const hasBuiltInZstd =
        typeof zlib.zstdCompress === 'function' && typeof zlib.zstdDecompress === 'function';

      if (hasBuiltInZstd) {
        expect(error).to.equal(null);
      } else {
        expect(error).to.be.instanceOf(MongoMissingDependencyError);
      }
    });
  });

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
