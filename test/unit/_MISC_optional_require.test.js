'use strict';

const { expect } = require('chai');
const { existsSync } = require('fs');
const { resolve } = require('path');

const { compress } = require('../../src/cmap/wire_protocol/compression');
const { GSSAPI } = require('../../src/cmap/auth/gssapi');
const { AuthContext } = require('../../src/cmap/auth/auth_provider');
const { MongoDBAWS } = require('../../src/cmap/auth/mongodb_aws');
const { HostAddress } = require('../../src/utils');
const { LEGACY_HELLO_COMMAND } = require('../../src/constants');

function moduleExistsSync(moduleName) {
  return existsSync(resolve(__dirname, `../../node_modules/${moduleName}`));
}

describe('optionalRequire', function () {
  context('Snappy', function () {
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

  context('Kerberos', function () {
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

  context('aws4', {
    metadata: {
      requires: {
        mongodb: '>=4.4'
      }
    },
    test: function () {
      it('should error if not installed', function () {
        const moduleName = 'aws4';
        if (moduleExistsSync(moduleName)) {
          return this.skip();
        }
        const mdbAWS = new MongoDBAWS();
        mdbAWS.auth(
          new AuthContext({ [LEGACY_HELLO_COMMAND]: { maxWireVersion: 9 } }, true, null),
          error => {
            expect(error).to.exist;
            expect(error.message).includes('not found');
          }
        );
      });
    }
  });
});
