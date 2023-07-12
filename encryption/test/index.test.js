'use strict';

const { expect } = require('chai');
const mongodbClientEncryption = require('../lib/index');
const { fetchAzureKMSToken } = require('../lib/providers');

// Update this as you add exports, helps double check we don't accidentally remove something
// since not all tests import from the root public export
const EXPECTED_EXPORTS = [
  'extension',
  'MongoCryptError',
  'MongoCryptCreateEncryptedCollectionError',
  'MongoCryptCreateDataKeyError',
  'MongoCryptAzureKMSRequestError',
  'MongoCryptKMSRequestNetworkTimeoutError',
  'AutoEncrypter',
  'ClientEncryption'
];

describe('mongodb-client-encryption entrypoint', () => {
  it('should export all and only the expected keys in expected_exports', () => {
    expect(mongodbClientEncryption).to.have.all.keys(EXPECTED_EXPORTS);
  });

  it('extension returns an object equal in shape to the default except for extension', () => {
    const extensionResult = mongodbClientEncryption.extension(require('mongodb'));
    const expectedExports = EXPECTED_EXPORTS.filter(exp => exp !== 'extension');
    const exportsDefault = Object.keys(mongodbClientEncryption).filter(exp => exp !== 'extension');
    expect(extensionResult).to.have.all.keys(expectedExports);
    expect(extensionResult).to.have.all.keys(exportsDefault);
  });

  context('exports for driver testing', () => {
    it('exports `fetchAzureKMSToken` in a symbol property', () => {
      expect(mongodbClientEncryption).to.have.property(
        '___azureKMSProseTestExports',
        fetchAzureKMSToken
      );
    });
    it('extension exports `fetchAzureKMSToken` in a symbol property', () => {
      const extensionResult = mongodbClientEncryption.extension(require('mongodb'));
      expect(extensionResult).to.have.property('___azureKMSProseTestExports', fetchAzureKMSToken);
    });
  });
});
