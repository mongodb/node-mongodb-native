'use strict';
const { expect } = require('chai');
const { existsSync } = require('fs');
const { resolve } = require('path');
const { compress } = require('../../mongodb');
const { GSSAPI } = require('../../mongodb');
const { AuthContext } = require('../../mongodb');
const { MongoDBAWS } = require('../../mongodb');
const { HostAddress } = require('../../mongodb');

function moduleExistsSync(moduleName) {
  return existsSync(resolve(__dirname, `../../../node_modules/${moduleName}`));
}
describe('optionalRequire', function () {
  describe('Snappy', function () {
    it('should error if not installed', function () {
      const moduleName = 'snappy';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }
      compress(
        {
          options: {
            agreedCompressor: 'snappy'
          }
        },
        Buffer.alloc(1),
        error => {
          expect(error).to.exist;
          expect(error.message).includes('not found');
        }
      );
    });
  });

  describe('Kerberos', function () {
    it('should error if not installed', function () {
      const moduleName = 'kerberos';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }
      const gssapi = new GSSAPI();
      gssapi.auth(
        new AuthContext(null, true, { hostAddress: new HostAddress('a'), credentials: true }),
        error => {
          expect(error).to.exist;
          expect(error.message).includes('not found');
        }
      );
    });
  });

  describe('aws4', function () {
    it('should error if not installed', function () {
      const moduleName = 'aws4';
      if (moduleExistsSync(moduleName)) {
        return this.skip();
      }
      const mdbAWS = new MongoDBAWS();
      mdbAWS.auth(new AuthContext({ hello: { maxWireVersion: 9 } }, true, null), error => {
        expect(error).to.exist;
        expect(error.message).includes('not found');
      });
    });
  });
});
